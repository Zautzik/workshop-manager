/**
 * @fileoverview WhatsApp Warehouse Webhook — Receives scans and messages
 *
 * Handles warehouse operator messages via WhatsApp:
 *   - QR code scans (custom WH:ACTION:item_id format)
 *   - Barcode scans (matched against inventory_items.barcode_value)
 *   - Free-text messages with action keywords + quantities
 *
 * POST /api/whatsapp/warehouse/webhook
 *   Body: { from: string, body: string, timestamp?: string }
 *
 * GET /api/whatsapp/warehouse/webhook
 *   Webhook verification (shares config with production webhook)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWarehouseMessage } from '@/lib/warehouse-parser';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import type { Json } from '@/integrations/supabase/types';

/* ─── Input Schema ───────────────────────────────────────────── */

const MAX_MESSAGE_LENGTH = 500;

const WebhookSchema = z.object({
  from: z.string().min(1).max(30).regex(/^\+?[\d\s\-()]+$/),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  timestamp: z.string().optional(),
  MessageSid: z.string().optional(),
  ProfileName: z.string().max(100).optional(),
});

/* ─── Signature Verification ─────────────────────────────────── */

function verifySignature(rawBody: string, signature: string | null): boolean {
  const authToken = process.env.WHATSAPP_AUTH_TOKEN;
  // Fail closed: a missing token is a misconfiguration, not a dev-mode pass.
  if (!authToken) return false;
  if (!signature) return false;

  const hash = crypto
    .createHmac('sha256', authToken)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  } catch {
    return false;
  }
}

/* ─── GET: Webhook Verification ──────────────────────────────── */

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token');

  if (challenge && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: 'WhatsApp warehouse webhook active' });
}

/* ─── POST: Receive Warehouse Message ────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // ── 0. Verify signature ────────────────────────────────
    const rawBodyText = await req.text();
    const signature = req.headers.get('x-twilio-signature') || req.headers.get('x-hub-signature-256');
    if (!verifySignature(rawBodyText, signature)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawBodyText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = WebhookSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { from, body, timestamp, ProfileName } = parsed.data;

    // ── Rate limit per sender (30 msg / min) ───────────────
    const rl = checkRateLimit(`whatsapp-warehouse:${from}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rl)) } },
      );
    }

    const messageTimestamp = timestamp || new Date().toISOString();

    // ── 1. Parse the message ───────────────────────────────
    const parseResult = parseWarehouseMessage(body);

    // ── 2. Look up operator ────────────────────────────────
    let operatorName: string | null = ProfileName ?? null;
    let operatorEmployeeId: string | null = null;

    const cleanPhone = from.replace(/\D/g, '');
    if (cleanPhone.length >= 7) {
      const phoneSuffix = cleanPhone.slice(-9);
      const { data: employees } = await supabaseAdmin
        .from('employees')
        .select('id, full_name, phone')
        .or(`phone.eq.${from},phone.ilike.%${phoneSuffix}`)
        .limit(10);

      const employee = employees?.find(e => e.phone === from)
        ?? employees?.find(e => e.phone?.replace(/\D/g, '').endsWith(phoneSuffix))
        ?? employees?.[0]
        ?? null;

      if (employee) {
        operatorName = employee.full_name;
        operatorEmployeeId = employee.id;
      }
    }

    // ── 3. Resolve inventory item ──────────────────────────
    let itemId: string | null = null;
    let itemName: string | null = null;
    let itemSku: string | null = null;
    let itemUnit: string | null = null;

    // 3a. From QR code (item ID directly)
    if (parseResult.qr_item_id) {
      const { data: item } = await supabaseAdmin
        .from('inventory_items')
        .select('id, name, sku, unit, is_active')
        .eq('id', parseResult.qr_item_id)
        .eq('is_active', true)
        .maybeSingle();

      if (item) {
        itemId = item.id;
        itemName = item.name;
        itemSku = item.sku;
        itemUnit = item.unit;
      }
    }

    // 3b. From barcode lookup
    if (!itemId && parseResult.barcode_value) {
      const { data: item } = await supabaseAdmin
        .from('inventory_items')
        .select('id, name, sku, unit, is_active')
        .eq('barcode_value', parseResult.barcode_value)
        .eq('is_active', true)
        .maybeSingle();

      if (item) {
        itemId = item.id;
        itemName = item.name;
        itemSku = item.sku;
        itemUnit = item.unit;
      }
    }

    // If no item found from scan, return helpful error
    if (!itemId && (parseResult.qr_item_id || parseResult.barcode_value)) {
      return NextResponse.json({
        status: 'not_found',
        reason: 'Producto no encontrado en inventario',
        scanned_value: parseResult.qr_item_id || parseResult.barcode_value,
        hint: 'Verifica que el código QR/barcode esté registrado en el sistema',
      }, { status: 404 });
    }

    // For text-only messages without an identified item
    if (!itemId && parseResult.scan_type === 'text') {
      return NextResponse.json({
        status: 'ignored',
        reason: 'Sin código QR ni código de barras detectado',
        hint: 'Escanea un código QR o código de barras para registrar movimientos de bodega. También puedes enviar el número de barras seguido de la cantidad.',
      });
    }

    // ── 4. Resolve OT (if referenced) ─────────────────────
    let otId: string | null = null;
    if (parseResult.ot_number) {
      const otNum = parseResult.ot_number;
      const { data: otData } = await supabaseAdmin
        .from('ots')
        .select('id')
        .or(`ot_number.eq.${otNum},ot_number.eq.OT-${otNum}`)
        .limit(1)
        .maybeSingle();

      if (otData) {
        otId = otData.id;
      }
    }

    // ── 5. Handle CHECK (stock inquiry) — auto-approved ────
    if (parseResult.action === 'check') {
      const { data: stockData } = await supabaseAdmin
        .from('inventory_items_stock_v')
        .select('current_stock, unit, weighted_unit_cost')
        .eq('id', itemId as string)
        .maybeSingle();

      // Log but auto-approve
      await supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .insert({
          action_type: 'check',
          item_id: itemId,
          item_name: itemName,
          item_sku: itemSku,
          operator_phone: from,
          operator_name: operatorName,
          operator_employee_id: operatorEmployeeId,
          scanned_value: parseResult.qr_item_id || parseResult.barcode_value || '',
          raw_message: body,
          message_timestamp: messageTimestamp,
          parsed_data: parseResult as unknown as Json,
          review_status: 'auto_approved',
        });

      return NextResponse.json({
        status: 'ok',
        type: 'check',
        item: {
          name: itemName,
          sku: itemSku,
          stock: stockData?.current_stock ?? 0,
          unit: stockData?.unit ?? itemUnit,
          value: stockData?.weighted_unit_cost ?? 0,
        },
        message: `📦 ${itemName} (${itemSku}): ${stockData?.current_stock ?? 0} ${stockData?.unit ?? itemUnit} en stock`,
      });
    }

    // ── 6. Dedup detection (same item + operator + action within 60s) ──
    if (itemId) {
      const { data: recentDup } = await supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id')
        .eq('item_id', itemId)
        .eq('operator_phone', from)
        .eq('action_type', parseResult.action)
        .gte('message_timestamp', new Date(Date.now() - 60_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentDup) {
        return NextResponse.json({
          status: 'duplicate',
          reason: 'Mensaje duplicado detectado',
          existing_log_id: recentDup.id,
        });
      }
    }

    // ── 7. Create pending warehouse log ────────────────────
    const unit = parseResult.unit ?? itemUnit;

    const { data: log, error } = await supabaseAdmin
      .from('whatsapp_warehouse_logs')
      .insert({
        action_type: parseResult.action !== 'unknown' ? parseResult.action : 'receive',
        item_id: itemId,
        item_name: itemName,
        item_sku: itemSku,
        lot_id: null,
        ot_number: parseResult.ot_number,
        ot_id: otId,
        operator_phone: from,
        operator_name: operatorName,
        operator_employee_id: operatorEmployeeId,
        scanned_value: parseResult.qr_item_id || parseResult.barcode_value || '',
        raw_message: body,
        message_timestamp: messageTimestamp,
        parsed_data: parseResult as unknown as Json,
        quantity: parseResult.quantity,
        unit,
        unit_cost: parseResult.unit_cost,
        supplier_name: parseResult.supplier_name,
        review_status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating warehouse log:', { phone: from, item: itemSku, error });
      return NextResponse.json({ error: 'Failed to log warehouse message' }, { status: 500 });
    }

    const actionLabels: Record<string, string> = {
      receive: '📥 Recepción',
      use: '📤 Consumo',
      return: '↩️ Devolución',
      unknown: '📦 Movimiento',
    };

    return NextResponse.json({
      status: 'ok',
      type: parseResult.action,
      log_id: log?.id,
      item: { name: itemName, sku: itemSku },
      quantity: parseResult.quantity,
      unit,
      confidence: parseResult.confidence,
      message: `${actionLabels[parseResult.action] ?? '📦'} registrado: ${itemName} (${itemSku})${parseResult.quantity ? ` — ${parseResult.quantity} ${unit}` : ''}. Pendiente de revisión.`,
    });
  } catch (error) {
    console.error('WhatsApp warehouse webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

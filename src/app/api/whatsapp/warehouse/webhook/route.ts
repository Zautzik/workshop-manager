/**
 * @fileoverview WhatsApp Warehouse Webhook — Receives scans and messages
 *
 * Handles warehouse operator messages via WhatsApp:
 *   - QR code scans (custom WH:ACTION:item_id format)
 *   - Barcode scans (matched against inventory_items.barcode_value)
 *   - Free-text messages with action keywords + quantities
 *
 * Provider selection (Meta Cloud API vs the legacy generic scheme) lives in
 * src/lib/whatsapp-intake.ts and is driven by the WHATSAPP_PROVIDER env var.
 *
 * POST /api/whatsapp/warehouse/webhook
 *   meta:    Meta Cloud API envelope (entry[].changes[].value.messages[])
 *   generic: { from: string, body: string, timestamp?: string }
 *
 * GET /api/whatsapp/warehouse/webhook
 *   Webhook verification (shares config with production webhook)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWarehouseMessage } from '@/lib/warehouse-parser';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import {
  whatsappProvider,
  verifyWhatsAppSignature,
  extractMetaInbound,
} from '@/lib/whatsapp-intake';
import { processWarehousePhoto } from '@/lib/warehouse-photo-ingest';
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

type WebhookInput = z.infer<typeof WebhookSchema>;

/** Transport-agnostic processing result; POST wraps it per provider. */
interface ProcessResult {
  status: number;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
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

/* ─── Message Processing ─────────────────────────────────────── */

async function processMessage(input: WebhookInput): Promise<ProcessResult> {
  const { from, body, timestamp, ProfileName } = input;

  // ── Rate limit per sender (30 msg / min) ───────────────
  const rl = checkRateLimit(`whatsapp-warehouse:${from}`, 30, 60_000);
  if (!rl.ok) {
    return {
      status: 429,
      payload: { error: 'Rate limit exceeded' },
      headers: { 'Retry-After': String(retryAfterSeconds(rl)) },
    };
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
    return {
      status: 404,
      payload: {
        status: 'not_found',
        reason: 'Producto no encontrado en inventario',
        scanned_value: parseResult.qr_item_id || parseResult.barcode_value,
        hint: 'Verifica que el código QR/barcode esté registrado en el sistema',
      },
    };
  }

  // For text-only messages without an identified item
  if (!itemId && parseResult.scan_type === 'text') {
    return {
      status: 200,
      payload: {
        status: 'ignored',
        reason: 'Sin código QR ni código de barras detectado',
        hint: 'Escanea un código QR o código de barras para registrar movimientos de bodega. También puedes enviar el número de barras seguido de la cantidad.',
      },
    };
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

    return {
      status: 200,
      payload: {
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
      },
    };
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
      return {
        status: 200,
        payload: {
          status: 'duplicate',
          reason: 'Mensaje duplicado detectado',
          existing_log_id: recentDup.id,
        },
      };
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
    return { status: 500, payload: { error: 'Failed to log warehouse message' } };
  }

  const actionLabels: Record<string, string> = {
    receive: '📥 Recepción',
    use: '📤 Consumo',
    return: '↩️ Devolución',
    unknown: '📦 Movimiento',
  };

  return {
    status: 200,
    payload: {
      status: 'ok',
      type: parseResult.action,
      log_id: log?.id,
      item: { name: itemName, sku: itemSku },
      quantity: parseResult.quantity,
      unit,
      confidence: parseResult.confidence,
      message: `${actionLabels[parseResult.action] ?? '📦'} registrado: ${itemName} (${itemSku})${parseResult.quantity ? ` — ${parseResult.quantity} ${unit}` : ''}. Pendiente de revisión.`,
    },
  };
}

/* ─── POST: Receive Warehouse Message ────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // ── 0. Verify signature ────────────────────────────────
    const rawBodyText = await req.text();
    if (!verifyWhatsAppSignature(rawBodyText, req.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawBodyText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // ── Meta Cloud API: normalize, then process each message ──
    if (whatsappProvider() === 'meta') {
      const intake = extractMetaInbound(rawBody);
      if (!intake.ok) {
        return NextResponse.json({ error: intake.error }, { status: 400 });
      }

      // Los acuses de entrega y las reacciones no traen nada que procesar.
      // Las fotos sin epígrafe SÍ, y desde ahora llegan hasta acá: el texto que
      // hay que leer viene dentro de la imagen.
      if (intake.messages.length === 0) {
        return NextResponse.json({
          status: 'ignored',
          reason: 'No processable text messages in envelope',
          ignored: intake.ignored,
        });
      }

      const results: Record<string, unknown>[] = [];
      for (const msg of intake.messages) {
        // ── La foto es el mensaje ────────────────────────────────────────
        //
        // Bodega no escribe: está de pie, con guantes, al lado de un pallet. El
        // gesto que sí hace es sacarle una foto a la etiqueta, y hasta ahora esa
        // foto se descartaba antes de llegar a ningún lado. Va por su propio
        // camino porque no hay texto que parsear — el código viene en los
        // píxeles.
        if (msg.media_only && msg.media_id) {
          const photo = await processWarehousePhoto({
            from: msg.from,
            media_id: msg.media_id,
            media_mime: msg.media_mime,
            profile_name: msg.ProfileName,
            timestamp: msg.timestamp,
          });
          results.push(photo.payload);
          continue;
        }

        const parsed = WebhookSchema.safeParse(msg);
        if (!parsed.success) {
          results.push({ status: 'invalid', details: parsed.error.flatten() });
          continue;
        }
        const result = await processMessage(parsed.data);
        results.push(result.payload);
      }

      // Always 200 toward Meta: a non-2xx makes the Cloud API retry the whole
      // envelope, re-running messages that already succeeded. Per-message
      // errors are in the payload and logged server-side.
      return NextResponse.json(
        results.length === 1 ? results[0] : { status: 'batch', results },
      );
    }

    // ── Generic: flat payload, original response semantics ──
    const parsed = WebhookSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await processMessage(parsed.data);
    return NextResponse.json(result.payload, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    console.error('WhatsApp warehouse webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * @fileoverview WhatsApp Webhook — Receives and processes operator messages
 *
 * This endpoint receives WhatsApp messages (via Twilio, WhatsApp Business API,
 * or similar provider), parses them, infers costs, and queues them for
 * supervisor review.
 *
 * POST /api/whatsapp/webhook
 *   Body: { from: string, body: string, timestamp?: string }
 *
 * GET /api/whatsapp/webhook
 *   WhatsApp webhook verification (Twilio/Meta challenge)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser';
import { inferProductionCosts, type OTContext } from '@/lib/whatsapp-cost-inference';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import logger from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

/* ─── Input Schema ───────────────────────────────────────────── */

const MAX_MESSAGE_LENGTH = 500;

const WebhookSchema = z.object({
  from: z.string().min(1).max(30).regex(/^\+?[\d\s\-()]+$/),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  timestamp: z.string().optional(),
  // Twilio-specific fields (optional)
  MessageSid: z.string().optional(),
  ProfileName: z.string().max(100).optional(),
});

/* ─── Webhook Signature Verification ─────────────────────────── */

function verifyTwilioSignature(rawBody: string, signature: string | null): boolean {
  const authToken = process.env.WHATSAPP_AUTH_TOKEN;
  // Fail closed: if the token is not configured the endpoint is locked.
  // Never bypass signature verification — a missing env var is a
  // misconfiguration, not a signal to allow unauthenticated requests.
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

function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '*');
  return `***${last4}`;
}

/* ─── GET: Webhook Verification ──────────────────────────────── */

export async function GET(req: NextRequest) {
  // Meta/Twilio webhook verification
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token');

  if (challenge && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: 'WhatsApp webhook active' });
}

/* ─── POST: Receive Message ──────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // ── 0. Verify webhook signature ────────────────────────
    const rawBodyText = await req.text();
    const signature = req.headers.get('x-twilio-signature') || req.headers.get('x-hub-signature-256');
    if (!verifyTwilioSignature(rawBodyText, signature)) {
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
    // Keyed on the sender's phone number, not the Twilio relay IP, so a
    // single noisy device can't flood the cost-inference pipeline.
    const rl = checkRateLimit(`whatsapp:${from}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rl)) } },
      );
    }

    const messageTimestamp = timestamp || new Date().toISOString();

    // ── 1. Parse the message ───────────────────────────────
    const parseResult = parseWhatsAppMessage(body);

    if (!parseResult.ot_number) {
      return NextResponse.json({
        status: 'ignored',
        reason: 'No OT number found in message',
        hint: 'Envía: INICIO OT-1234  o  FIN OT-1234 [datos de producción]',
      });
    }

    // Validate OT number format strictly (digits only, 1-6 chars)
    if (!/^\d{1,6}$/.test(parseResult.ot_number)) {
      return NextResponse.json(
        { error: 'Formato de OT inválido', hint: 'El número de OT debe ser numérico (1-6 dígitos)' },
        { status: 400 },
      );
    }

    // ── 2. Look up the OT in the system ────────────────────
    let otId: string | null = null;
    let otContext: OTContext | null = null;

    const otNum = parseResult.ot_number;
    const { data: otData, error: otLookupError } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, quantity, substrate_type, grammage_gsm, width_cm, height_cm, client_name, product_name, status')
      .in('ot_number', [otNum, `OT-${otNum}`])
      .limit(1)
      .maybeSingle();

    if (otLookupError) {
      logger.warn(
        {
          err: otLookupError,
          phone: redactPhone(from),
          ot: parseResult.ot_number,
        },
        'OT lookup failed during webhook processing',
      );
    }

    if (otData) {
      otId = otData.id;
      otContext = {
        ot_number: otData.ot_number,
        quantity: otData.quantity ?? undefined,
        substrate_type: otData.substrate_type ?? undefined,
        grammage_gsm: otData.grammage_gsm ?? undefined,
        sheet_width: otData.width_cm ? otData.width_cm * 10 : undefined,
        sheet_height: otData.height_cm ? otData.height_cm * 10 : undefined,
      };
    }

    // ── 3. Look up the operator (prefer exact match) ───────
    let operatorName: string | null = ProfileName ?? null;
    let operatorEmployeeId: string | null = null;

    const cleanPhone = from.replace(/\D/g, '');
    if (cleanPhone.length >= 7) {
      const phoneSuffix = cleanPhone.slice(-9);

      const { data: exactEmployee, error: exactEmployeeError } = await supabaseAdmin
        .from('employees')
        .select('id, full_name, phone')
        .eq('phone', from)
        .limit(1)
        .maybeSingle();

      if (exactEmployeeError) {
        logger.warn(
          { err: exactEmployeeError, phone: redactPhone(from) },
          'Exact employee lookup failed during webhook processing',
        );
      }

      let employee = exactEmployee;

      if (!employee) {
        const { data: suffixEmployees, error: suffixEmployeeError } = await supabaseAdmin
          .from('employees')
          .select('id, full_name, phone')
          .ilike('phone', `%${phoneSuffix}`)
          .limit(10);

        if (suffixEmployeeError) {
          logger.warn(
            { err: suffixEmployeeError, phone: redactPhone(from) },
            'Suffix employee lookup failed during webhook processing',
          );
        }

        employee =
          suffixEmployees?.find((e) => e.phone?.replace(/\D/g, '').endsWith(phoneSuffix))
          ?? suffixEmployees?.[0]
          ?? null;
      }

      if (employee) {
        operatorName = employee.full_name;
        operatorEmployeeId = employee.id;
      }
    }

    // ── 4a. Handle CANCEL message ──────────────────────────
    if (parseResult.message_type === 'cancel') {
      // Find and close the most recent active START for this operator + OT
      const { data: activeStart } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id')
        .eq('ot_number', parseResult.ot_number)
        .eq('operator_phone', from)
        .eq('message_type', 'start')
        .eq('review_status', 'auto_approved')
        .order('message_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeStart) {
        await supabaseAdmin
          .from('whatsapp_production_logs')
          .update({
            review_status: 'rejected',
            review_comments: 'Cancelado por el operador',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', activeStart.id);
      }

      return NextResponse.json({
        status: 'ok',
        type: 'cancel',
        ot_number: parseResult.ot_number,
        cancelled_start: activeStart?.id ?? null,
        message: `🚫 Sesión cancelada para OT ${parseResult.ot_number}`,
      });
    }

    // ── 4b. Handle START message ───────────────────────────
    if (parseResult.message_type === 'start') {
      const { data: log, error } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .insert({
          ot_number: parseResult.ot_number,
          ot_id: otId,
          operator_phone: from,
          operator_name: operatorName,
          operator_employee_id: operatorEmployeeId,
          message_type: 'start',
          raw_message: body,
          message_timestamp: messageTimestamp,
          review_status: 'auto_approved', // START messages don't need review
        })
        .select('id')
        .single();

      if (error) {
        logger.error(
          {
            err: error,
            phone: redactPhone(from),
            ot: parseResult.ot_number,
          },
          'Error creating start log',
        );
        return NextResponse.json({ error: 'Failed to log start message' }, { status: 500 });
      }

      return NextResponse.json({
        status: 'ok',
        type: 'start',
        ot_number: parseResult.ot_number,
        log_id: log?.id,
        message: `✅ Inicio registrado para OT ${parseResult.ot_number}`,
      });
    }

    // ── 5. Handle END message ──────────────────────────────
    if (parseResult.message_type === 'end' && parseResult.production_data) {
      // Deduplication: reject duplicate end messages (same OT + phone within 60s)
      const { data: recentDup } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id')
        .eq('ot_number', parseResult.ot_number)
        .eq('operator_phone', from)
        .eq('message_type', 'end')
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

      // Find the matching START log
      let startLogId: string | null = null;
      let elapsedMinutes: number | null = null;

      const { data: startLog, error: startLookupError } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id, message_timestamp')
        .eq('ot_number', parseResult.ot_number)
        .eq('operator_phone', from)
        .eq('message_type', 'start')
        .order('message_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (startLookupError) {
        logger.warn(
          {
            err: startLookupError,
            phone: redactPhone(from),
            ot: parseResult.ot_number,
          },
          'START log lookup failed during webhook processing',
        );
      }

      if (startLog) {
        startLogId = startLog.id;
        const startTime = new Date(startLog.message_timestamp);
        const endTime = new Date(messageTimestamp);
        elapsedMinutes = Number(((endTime.getTime() - startTime.getTime()) / 60000).toFixed(2));
      }

      // Infer costs
      const inferredCosts = inferProductionCosts(
        parseResult.production_data,
        elapsedMinutes,
        otContext,
      );

      // Save the END log
      const { data: log, error } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .insert({
          ot_number: parseResult.ot_number,
          ot_id: otId,
          operator_phone: from,
          operator_name: operatorName,
          operator_employee_id: operatorEmployeeId,
          message_type: 'end',
          raw_message: body,
          message_timestamp: messageTimestamp,
          parsed_data: parseResult.production_data as unknown as Json,
          inferred_costs: inferredCosts as unknown as Json,
          start_log_id: startLogId,
          elapsed_minutes: elapsedMinutes,
          review_status: 'pending', // END messages need supervisor review
        })
        .select('id')
        .single();

      if (error) {
        logger.error(
          {
            err: error,
            phone: redactPhone(from),
            ot: parseResult.ot_number,
          },
          'Error creating end log',
        );
        return NextResponse.json({ error: 'Failed to log end message' }, { status: 500 });
      }

      return NextResponse.json({
        status: 'ok',
        type: 'end',
        ot_number: parseResult.ot_number,
        log_id: log?.id,
        elapsed_minutes: elapsedMinutes,
        confidence: parseResult.production_data.confidence,
        inferred_total: inferredCosts.total_inferred_cost,
        message: `✅ Fin registrado para OT ${parseResult.ot_number}. Pendiente de revisión del supervisor.`,
      });
    }

    // ── 6. Unknown message ─────────────────────────────────
    return NextResponse.json({
      status: 'unknown',
      ot_number: parseResult.ot_number,
      message: `❓ No entendí tu mensaje. Usa:\n• INICIO OT-${parseResult.ot_number}\n• FIN OT-${parseResult.ot_number} [datos de producción]`,
    });
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp webhook error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

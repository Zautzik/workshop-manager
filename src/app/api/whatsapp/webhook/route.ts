/**
 * @fileoverview WhatsApp Webhook — Receives and processes operator messages
 *
 * This endpoint receives WhatsApp messages, parses them, infers costs, and
 * queues them for supervisor review. Provider selection (Meta Cloud API vs
 * the legacy generic scheme) lives in src/lib/whatsapp-intake.ts and is
 * driven by the WHATSAPP_PROVIDER env var.
 *
 * POST /api/whatsapp/webhook
 *   meta:    Meta Cloud API envelope (entry[].changes[].value.messages[])
 *   generic: { from: string, body: string, timestamp?: string }
 *
 * GET /api/whatsapp/webhook
 *   Webhook verification (Meta hub.challenge handshake)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser';
import { inferProductionCosts, type OTContext } from '@/lib/whatsapp-cost-inference';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import {
  whatsappProvider,
  verifyWhatsAppSignature,
  extractMetaInbound,
} from '@/lib/whatsapp-intake';
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

type WebhookInput = z.infer<typeof WebhookSchema>;

/** Transport-agnostic processing result; POST wraps it per provider. */
interface ProcessResult {
  status: number;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
}

function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '*');
  return `***${last4}`;
}

/* ─── GET: Webhook Verification ──────────────────────────────── */

export async function GET(req: NextRequest) {
  // Meta webhook verification handshake
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token');

  if (challenge && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: 'WhatsApp webhook active' });
}

/* ─── Message Processing ─────────────────────────────────────── */

async function processMessage(input: WebhookInput): Promise<ProcessResult> {
  const { from, body, timestamp, ProfileName } = input;

  // ── Rate limit per sender (30 msg / min) ───────────────
  // Keyed on the sender's phone number, not the relay IP, so a
  // single noisy device can't flood the cost-inference pipeline.
  const rl = checkRateLimit(`whatsapp:${from}`, 30, 60_000);
  if (!rl.ok) {
    return {
      status: 429,
      payload: { error: 'Rate limit exceeded' },
      headers: { 'Retry-After': String(retryAfterSeconds(rl)) },
    };
  }

  const messageTimestamp = timestamp || new Date().toISOString();

  // ── 1. Parse the message ───────────────────────────────
  const parseResult = parseWhatsAppMessage(body);

  if (!parseResult.ot_number) {
    return {
      status: 200,
      payload: {
        status: 'ignored',
        reason: 'No OT number found in message',
        hint: 'Envía: INICIO OT-1234  o  FIN OT-1234 [datos de producción]',
      },
    };
  }

  // Validate OT number format strictly (digits only, 1-6 chars)
  if (!/^\d{1,6}$/.test(parseResult.ot_number)) {
    return {
      status: 400,
      payload: {
        error: 'Formato de OT inválido',
        hint: 'El número de OT debe ser numérico (1-6 dígitos)',
      },
    };
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

    return {
      status: 200,
      payload: {
        status: 'ok',
        type: 'cancel',
        ot_number: parseResult.ot_number,
        cancelled_start: activeStart?.id ?? null,
        message: `🚫 Sesión cancelada para OT ${parseResult.ot_number}`,
      },
    };
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
      return { status: 500, payload: { error: 'Failed to log start message' } };
    }

    return {
      status: 200,
      payload: {
        status: 'ok',
        type: 'start',
        ot_number: parseResult.ot_number,
        log_id: log?.id,
        message: `✅ Inicio registrado para OT ${parseResult.ot_number}`,
      },
    };
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
      return {
        status: 200,
        payload: {
          status: 'duplicate',
          reason: 'Mensaje duplicado detectado',
          existing_log_id: recentDup.id,
        },
      };
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
      return { status: 500, payload: { error: 'Failed to log end message' } };
    }

    return {
      status: 200,
      payload: {
        status: 'ok',
        type: 'end',
        ot_number: parseResult.ot_number,
        log_id: log?.id,
        elapsed_minutes: elapsedMinutes,
        confidence: parseResult.production_data.confidence,
        inferred_total: inferredCosts.total_inferred_cost,
        message: `✅ Fin registrado para OT ${parseResult.ot_number}. Pendiente de revisión del supervisor.`,
      },
    };
  }

  // ── 6. Unknown message ─────────────────────────────────
  return {
    status: 200,
    payload: {
      status: 'unknown',
      ot_number: parseResult.ot_number,
      message: `❓ No entendí tu mensaje. Usa:\n• INICIO OT-${parseResult.ot_number}\n• FIN OT-${parseResult.ot_number} [datos de producción]`,
    },
  };
}

/* ─── POST: Receive Message ──────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // ── 0. Verify webhook signature ────────────────────────
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

      // Status-only webhooks (delivery receipts) and captionless media land
      // here: acknowledge so Meta doesn't retry.
      if (intake.messages.length === 0) {
        return NextResponse.json({
          status: 'ignored',
          reason: 'No processable text messages in envelope',
          ignored: intake.ignored,
        });
      }

      const results: Record<string, unknown>[] = [];
      for (const msg of intake.messages) {
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
    logger.error({ err: error }, 'WhatsApp webhook error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

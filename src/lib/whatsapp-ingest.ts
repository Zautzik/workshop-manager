/**
 * @fileoverview WhatsApp Ingest — the transport-agnostic processing pipeline.
 *
 * Extracted from /api/whatsapp/webhook (P2.6, demo-readiness plan) so the
 * production webhook AND the in-app simulator run the exact same code path:
 * parse → OT lookup → operator lookup → session log → cost inference →
 * review queue, plus photo evidence attachment.
 *
 * v2 (P2.7): a single inbound message can carry SEVERAL actions — the plant's
 * canonical report "Fin OT 40879, 7600 pliegos, entro OT 40965" is one END
 * plus one START. parseWhatsAppEvents() splits them; every event is processed
 * and the response aggregates per-event results.
 *
 * Media (P2.8): an inbound photo (media_url from the simulator/generic
 * payloads, or a Meta media id resolved via the Graph API when
 * WHATSAPP_ACCESS_TOKEN is set) is stored in the ot-attachments bucket and
 * registered as OT evidence — it feeds the FSSC dossier's photo requirement.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWhatsAppEvents, type ParseResult } from '@/lib/whatsapp-parser';
import { inferProductionCosts, type OTContext } from '@/lib/whatsapp-cost-inference';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import logger from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

/* ─── Input Schema ───────────────────────────────────────────── */

const MAX_MESSAGE_LENGTH = 500;

export const InboundMessageSchema = z.object({
  from: z.string().min(1).max(30).regex(/^\+?[\d\s\-()]+$/),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  timestamp: z.string().optional(),
  MessageSid: z.string().optional(),
  ProfileName: z.string().max(100).optional(),
  // Photo evidence: direct URL (simulator / generic relays) or a Meta media
  // id (resolved through the Graph API when an access token is configured).
  media_url: z.string().url().max(2000).optional(),
  media_id: z.string().max(100).optional(),
  media_mime: z.string().max(100).optional(),
  /** El wamid de Meta. Ausente para el simulador y el proveedor genérico —
   *  esos mensajes no tienen deduplicación, igual que antes. */
  message_id: z.string().max(100).optional(),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

/** Transport-agnostic processing result; the caller wraps it per provider. */
export interface ProcessResult {
  status: number;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  /**
   * Presente cuando llegó una foto para adjuntar. Descargarla y subirla es
   * I/O externo (Graph API + Storage) que no tiene por qué demorar la
   * respuesta a Meta -- el webhook la difiere con `after()`; el simulador,
   * que no tiene ese apuro, la espera inline para mostrar el resultado en el
   * momento (ver /api/whatsapp/simulate).
   */
  mediaTask?: () => Promise<{ attached: boolean; attachment_id?: string; reason?: string }>;
}

export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '*');
  return `***${last4}`;
}

/* ─── Media evidence ─────────────────────────────────────────── */

const MEDIA_BUCKET = 'ot-attachments';
const MAX_MEDIA_BYTES = 8 * 1024 * 1024; // 8 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Create the attachments bucket on first use (mirrors /api/attachments/upload). */
let bucketEnsured = false;
async function ensureMediaBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === MEDIA_BUCKET);
  if (!exists) {
    await supabaseAdmin.storage.createBucket(MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_MEDIA_BYTES}`,
    });
  }
  bucketEnsured = true;
}

/** Resolve a Meta media id to its short-lived download URL via the Graph API. */
async function resolveMetaMediaUrl(mediaId: string): Promise<{ url: string; mime: string | null } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const meta = (await res.json()) as { url?: string; mime_type?: string };
  return meta.url ? { url: meta.url, mime: meta.mime_type ?? null } : null;
}

/**
 * Download inbound media and register it as OT evidence (storage + row in
 * ot_attachments — the same table the FSSC dossier reads for photo evidence).
 * Best-effort: failures are logged and reported in the payload, never fatal.
 */
async function attachInboundMedia(
  otId: string,
  input: Pick<InboundMessage, 'media_url' | 'media_id' | 'media_mime' | 'from'>,
): Promise<{ attached: boolean; attachment_id?: string; reason?: string }> {
  try {
    let url = input.media_url ?? null;
    let mime = input.media_mime ?? null;
    let authHeader: Record<string, string> = {};

    if (!url && input.media_id) {
      const resolved = await resolveMetaMediaUrl(input.media_id);
      if (!resolved) {
        return { attached: false, reason: 'Media id sin WHATSAPP_ACCESS_TOKEN configurado' };
      }
      url = resolved.url;
      mime = mime ?? resolved.mime;
      // Meta media downloads require the same bearer token.
      authHeader = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
    }
    if (!url) return { attached: false, reason: 'Sin media' };

    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) return { attached: false, reason: `Descarga falló (${res.status})` };

    const contentType = mime ?? res.headers.get('content-type') ?? 'image/jpeg';
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
      return { attached: false, reason: 'Archivo vacío o sobre 8 MB' };
    }

    const ext = EXT_BY_MIME[contentType] ?? 'bin';
    const filename = `whatsapp_${Date.now()}.${ext}`;
    const storagePath = `ot/${otId}/${filename}`;

    await ensureMediaBucket();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false });
    if (uploadError) {
      logger.error({ err: uploadError, ot: otId }, 'WhatsApp media upload failed');
      return { attached: false, reason: 'Error subiendo a storage' };
    }

    const { data: attachment, error: insertError } = await supabaseAdmin
      .from('ot_attachments')
      .insert([
        {
          ot_id: otId,
          filename,
          storage_path: storagePath,
          file_size: bytes.byteLength,
          mime_type: contentType,
          uploaded_by: null, // system: arrived via WhatsApp
        },
      ])
      .select('id')
      .single();

    if (insertError || !attachment) {
      logger.error({ err: insertError, ot: otId }, 'WhatsApp media attachment row failed');
      return { attached: false, reason: 'Error registrando evidencia' };
    }

    return { attached: true, attachment_id: attachment.id };
  } catch (err) {
    logger.error({ err, phone: redactPhone(input.from ?? '') }, 'WhatsApp media attach error');
    return { attached: false, reason: 'Error inesperado adjuntando media' };
  }
}

/* ─── Per-event processing ───────────────────────────────────── */

interface EventContext {
  from: string;
  rawBody: string;
  messageTimestamp: string;
  operatorName: string | null;
  operatorEmployeeId: string | null;
  /** El wamid de Meta, o null para simulador/proveedor genérico. */
  messageId: string | null;
}

interface EventOutcome {
  status: number;
  payload: Record<string, unknown>;
  /** OT uuid the event resolved to, when found — used for media evidence. */
  otId: string | null;
}

async function processEvent(event: ParseResult, ctx: EventContext): Promise<EventOutcome> {
  const { from, rawBody, messageTimestamp, operatorName, operatorEmployeeId, messageId } = ctx;

  if (!event.ot_number) {
    return {
      status: 200,
      otId: null,
      payload: {
        status: 'ignored',
        reason: 'No OT number found in message',
        hint: 'Envía: INICIO 40502  o  FIN 40502 [datos de producción]',
      },
    };
  }

  // Validate OT number format strictly (digits only, 1-6 chars)
  if (!/^\d{1,6}$/.test(event.ot_number)) {
    return {
      status: 400,
      otId: null,
      payload: {
        error: 'Formato de OT inválido',
        hint: 'El número de OT debe ser numérico (1-6 dígitos)',
      },
    };
  }

  // ── Look up the OT ──────────────────────────────────────
  let otId: string | null = null;
  let otContext: OTContext | null = null;

  const otNum = event.ot_number;
  const { data: otData, error: otLookupError } = await supabaseAdmin
    .from('ots')
    .select('id, ot_number, quantity, substrate_type, grammage_gsm, width_cm, height_cm, client_name, product_name, status')
    .in('ot_number', [otNum, `OT-${otNum}`])
    .limit(1)
    .maybeSingle();

  if (otLookupError) {
    logger.warn(
      { err: otLookupError, phone: redactPhone(from), ot: event.ot_number },
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

  // ── CANCEL ──────────────────────────────────────────────
  if (event.message_type === 'cancel') {
    const { data: activeStart } = await supabaseAdmin
      .from('whatsapp_production_logs')
      .select('id')
      .eq('ot_number', event.ot_number)
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
      otId,
      payload: {
        status: 'ok',
        type: 'cancel',
        ot_number: event.ot_number,
        cancelled_start: activeStart?.id ?? null,
        message: `🚫 Sesión cancelada para OT ${event.ot_number}`,
      },
    };
  }

  // ── START ───────────────────────────────────────────────
  if (event.message_type === 'start') {
    // insert_whatsapp_log_idempotent() atrapa la violación de unicidad sobre
    // external_message_id -- una redelivery del mismo wamid vuelve acá con
    // `inserted: false` y el id de la fila que ya existía, no un error. Antes
    // esto no tenía NINGUNA deduplicación: cada reintento de Meta creaba una
    // fila 'auto_approved' nueva.
    const { data: rows, error } = await supabaseAdmin.rpc('insert_whatsapp_log_idempotent', {
      p_external_message_id: messageId,
      p_ot_number: event.ot_number,
      p_ot_id: otId,
      p_operator_phone: from,
      p_operator_name: operatorName,
      p_operator_employee_id: operatorEmployeeId,
      p_message_type: 'start',
      p_raw_message: rawBody,
      p_message_timestamp: messageTimestamp,
      p_review_status: 'auto_approved', // START messages don't need review
    });

    if (error) {
      logger.error(
        { err: error, phone: redactPhone(from), ot: event.ot_number },
        'Error creating start log',
      );
      return { status: 500, otId, payload: { error: 'Failed to log start message' } };
    }

    const row = rows?.[0];
    if (row && row.inserted === false) {
      return {
        status: 200,
        otId,
        payload: { status: 'duplicate', type: 'start', ot_number: event.ot_number, existing_log_id: row.id },
      };
    }

    return {
      status: 200,
      otId,
      payload: {
        status: 'ok',
        type: 'start',
        ot_number: event.ot_number,
        log_id: row?.id,
        message: `✅ Inicio registrado para OT ${event.ot_number}`,
      },
    };
  }

  // ── END ─────────────────────────────────────────────────
  if (event.message_type === 'end' && event.production_data) {
    // Find the matching START log
    let startLogId: string | null = null;
    let elapsedMinutes: number | null = null;

    const { data: startLog, error: startLookupError } = await supabaseAdmin
      .from('whatsapp_production_logs')
      .select('id, message_timestamp')
      .eq('ot_number', event.ot_number)
      .eq('operator_phone', from)
      .eq('message_type', 'start')
      .order('message_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (startLookupError) {
      logger.warn(
        { err: startLookupError, phone: redactPhone(from), ot: event.ot_number },
        'START log lookup failed during webhook processing',
      );
    }

    if (startLog) {
      startLogId = startLog.id;
      const startTime = new Date(startLog.message_timestamp);
      const endTime = new Date(messageTimestamp);
      elapsedMinutes = Number(((endTime.getTime() - startTime.getTime()) / 60000).toFixed(2));
    }

    const inferredCosts = inferProductionCosts(event.production_data, elapsedMinutes, otContext);

    // Mismo camino atómico que START. Esto es lo que de verdad protege
    // ot_real_costs: la ventana de 60 segundos que había acá antes sólo
    // cubría una redelivery RÁPIDA -- una que llega minutos después (un
    // reintento real de Meta tras un corte) pasaba, creaba una segunda fila
    // 'pending', y si un supervisor aprobaba las dos el mismo trabajo se
    // contaba como costo real dos veces.
    const { data: rows, error } = await supabaseAdmin.rpc('insert_whatsapp_log_idempotent', {
      p_external_message_id: messageId,
      p_ot_number: event.ot_number,
      p_ot_id: otId,
      p_operator_phone: from,
      p_operator_name: operatorName,
      p_operator_employee_id: operatorEmployeeId,
      p_message_type: 'end',
      p_raw_message: rawBody,
      p_message_timestamp: messageTimestamp,
      p_review_status: 'pending', // END messages need supervisor review
      p_parsed_data: event.production_data as unknown as Json,
      p_inferred_costs: inferredCosts as unknown as Json,
      p_start_log_id: startLogId,
      p_elapsed_minutes: elapsedMinutes,
    });

    if (error) {
      logger.error(
        { err: error, phone: redactPhone(from), ot: event.ot_number },
        'Error creating end log',
      );
      return { status: 500, otId, payload: { error: 'Failed to log end message' } };
    }

    const row = rows?.[0];
    if (row && row.inserted === false) {
      return {
        status: 200,
        otId,
        payload: { status: 'duplicate', reason: 'Mensaje duplicado detectado', existing_log_id: row.id },
      };
    }

    return {
      status: 200,
      otId,
      payload: {
        status: 'ok',
        type: 'end',
        ot_number: event.ot_number,
        log_id: row?.id,
        elapsed_minutes: elapsedMinutes,
        confidence: event.production_data.confidence,
        inferred_total: inferredCosts.total_inferred_cost,
        message: `✅ Fin registrado para OT ${event.ot_number}. Pendiente de revisión del supervisor.`,
      },
    };
  }

  // ── Unknown ─────────────────────────────────────────────
  return {
    status: 200,
    otId,
    payload: {
      status: 'unknown',
      ot_number: event.ot_number,
      message: `❓ No entendí tu mensaje. Usa:\n• INICIO OT-${event.ot_number}\n• FIN OT-${event.ot_number} [datos de producción]`,
    },
  };
}

/* ─── Main entry ─────────────────────────────────────────────── */

export async function processMessage(input: InboundMessage): Promise<ProcessResult> {
  const { from, body, timestamp } = input;

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

  // ── Operator lookup (once per message, shared by all events) ──
  let operatorName: string | null = input.ProfileName ?? null;
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

  // ── Parse into one or more events and process each ─────
  const events = parseWhatsAppEvents(body);
  const ctx: EventContext = {
    from,
    rawBody: body,
    messageTimestamp,
    operatorName,
    operatorEmployeeId,
    messageId: input.message_id ?? null,
  };

  const outcomes: EventOutcome[] = [];
  for (const event of events) {
    outcomes.push(await processEvent(event, ctx));
  }

  // ── Photo evidence: attach to the first event that hit a real OT ──
  //
  // Diferido, no ejecutado acá: `attachInboundMedia` hace hasta tres llamadas
  // de red externas (Graph API + descarga + Storage), y nada de eso tiene por
  // qué demorar el ack a Meta. El webhook la corre con `after()`, después de
  // responder; el simulador (que no tiene ese apuro y sí quiere ver el
  // resultado) la espera inline. `processMessage` no sabe cuál es su llamador
  // -- por eso devuelve la tarea en vez de decidir por quien la use.
  let mediaTask: ProcessResult['mediaTask'];
  if (input.media_url || input.media_id) {
    const target = outcomes.find((o) => o.otId)?.otId ?? null;
    mediaTask = target
      ? () => attachInboundMedia(target, input)
      : async () => ({ attached: false, reason: 'Ninguna OT reconocida para adjuntar la foto' });
  }

  // ── Aggregate ───────────────────────────────────────────
  if (outcomes.length === 1) {
    return { status: outcomes[0].status, payload: outcomes[0].payload, mediaTask };
  }

  const messages = outcomes
    .map((o) => (typeof o.payload.message === 'string' ? o.payload.message : null))
    .filter(Boolean);
  return {
    status: 200,
    payload: {
      status: 'multi',
      events: outcomes.map((o) => o.payload),
      message: messages.join('\n'),
    },
    mediaTask,
  };
}

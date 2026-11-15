/**
 * @fileoverview WhatsApp Webhook — transport layer only.
 *
 * Signature verification + provider payload normalization live in
 * src/lib/whatsapp-intake.ts (WHATSAPP_PROVIDER: meta | generic); the actual
 * processing pipeline (parsing — including compound multi-action messages —,
 * session logs, cost inference, photo evidence) lives in
 * src/lib/whatsapp-ingest.ts and is shared with the in-app simulator
 * (/api/whatsapp/simulate).
 *
 * Idempotency: every message is claimed by its wamid BEFORE it is processed
 * (src/lib/whatsapp-claim.ts → whatsapp_inbound_claims). A redelivery of a
 * wamid that is already claimed is acknowledged with 200 and nothing runs —
 * not the maintenance reply, not the parser, not the photo download. The
 * per-row guard in insert_whatsapp_log_idempotent() stays as a second line
 * for production logs.
 *
 * Photo evidence (Graph API download + Storage upload) runs via `after()`,
 * scheduled once the ack below is already on the wire — Meta doesn't wait on
 * it, and a slow/failed download can't turn into a retried delivery.
 *
 * POST /api/whatsapp/webhook
 *   meta:    Meta Cloud API envelope (entry[].changes[].value.messages[])
 *   generic: { from: string, body: string, timestamp?, media_url?, message_id? }
 *
 * GET /api/whatsapp/webhook
 *   Webhook verification (Meta hub.challenge handshake)
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import {
  whatsappProvider,
  verifyWhatsAppSignature,
  extractMetaInbound,
} from '@/lib/whatsapp-intake';
import {
  InboundMessageSchema,
  processMessage,
  redactPhone,
  type InboundMessage,
  type ProcessResult,
} from '@/lib/whatsapp-ingest';
import { runUnderClaim } from '@/lib/whatsapp-claim';
import logger from '@/lib/logger';

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

// Meta's real envelopes run a few KB. This is headroom, not a measured
// requirement -- the point is that nothing enforced a limit before this: Next
// 16 Route Handlers expose no body-size config (unlike the old Pages API
// routes' bodyParser), so the only backstop was whatever the host enforces.
// JSON.parse on a multi-MB string blocks the event loop for the duration of
// the parse -- every other request queued behind it waits (auditoría de
// rendimiento 2026-09-08).
const MAX_WEBHOOK_BYTES = 256 * 1024;

/* ─── Idempotency lock ───────────────────────────────────────── */

/** Procesa un mensaje bajo el candado de su wamid (ver `runUnderClaim`). */
function processUnderLock(wamid: string, message: InboundMessage) {
  return runUnderClaim<ProcessResult>('production', wamid, () => processMessage(message));
}

/* ─── POST: Receive Message ──────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // ── 0. Verify webhook signature ────────────────────────
    const rawBodyText = await req.text();
    if (rawBodyText.length > MAX_WEBHOOK_BYTES) {
      // Antes de verificar la firma, no después: el HMAC sobre el cuerpo
      // entero es trabajo O(tamaño) que no vale la pena gastar en un payload
      // que ya se va a rechazar.
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
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
        const parsed = InboundMessageSchema.safeParse(msg);
        if (!parsed.success) {
          results.push({ status: 'invalid', details: parsed.error.flatten() });
          continue;
        }

        // Estricto: sin wamid no hay candado, y sin candado no se procesa.
        // Meta manda `id` en todo mensaje real; uno que llega sin él no se
        // puede deduplicar, así que no entra.
        const wamid = parsed.data.message_id;
        if (!wamid) {
          logger.warn(
            { phone: redactPhone(parsed.data.from) },
            'WhatsApp webhook: mensaje de Meta sin wamid, no se procesa',
          );
          results.push({ status: 'ignored', reason: 'Mensaje sin wamid' });
          continue;
        }

        // Si esto lanza, sale por el catch de abajo con 500 y Meta reintenta
        // el sobre entero: los mensajes que ya se procesaron conservan su
        // candado y se saltan; el que falló lo soltó y vuelve a entrar.
        const outcome = await processUnderLock(wamid, parsed.data);
        if (outcome.duplicate) {
          results.push({ status: 'duplicate', message_id: wamid });
          continue;
        }

        results.push(outcome.result.payload);
        // Media (Graph API download + Storage upload) happens AFTER Meta gets
        // its ack, not before -- see the audit note on processMessage.
        if (outcome.result.mediaTask) after(outcome.result.mediaTask);
      }

      // Always 200 toward Meta: a non-2xx makes the Cloud API retry the whole
      // envelope. Per-message errors are in the payload and logged server-side.
      return NextResponse.json(
        results.length === 1 ? results[0] : { status: 'batch', results },
      );
    }

    // ── Generic: flat payload, original response semantics ──
    const parsed = InboundMessageSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // El proveedor genérico (curl, relays internos) puede no mandar id. Con
    // `message_id` se aplica el mismo candado; sin él se procesa como antes,
    // sin deduplicación -- no hay llave con la que hacerla.
    const wamid = parsed.data.message_id;
    if (!wamid) {
      const result = await processMessage(parsed.data);
      if (result.mediaTask) after(result.mediaTask);
      return NextResponse.json(result.payload, {
        status: result.status,
        headers: result.headers,
      });
    }

    const outcome = await processUnderLock(wamid, parsed.data);
    if (outcome.duplicate) {
      return NextResponse.json({ status: 'duplicate', message_id: wamid });
    }

    if (outcome.result.mediaTask) after(outcome.result.mediaTask);
    return NextResponse.json(outcome.result.payload, {
      status: outcome.result.status,
      headers: outcome.result.headers,
    });
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp webhook error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

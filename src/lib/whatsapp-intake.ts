/**
 * @fileoverview WhatsApp Webhook Intake — provider-aware signature
 * verification and payload normalization.
 *
 * Shared by /api/whatsapp/webhook and /api/whatsapp/warehouse/webhook so both
 * endpoints accept the same providers and stay in lockstep.
 *
 * Providers (selected via WHATSAPP_PROVIDER, default "generic"):
 *
 *   meta    — WhatsApp Cloud API (Graph API). Signature arrives as
 *             `X-Hub-Signature-256: sha256=<hex>` — HMAC-SHA256 of the raw
 *             request body keyed with the Meta App Secret
 *             (WHATSAPP_AUTH_TOKEN). Payload is the nested
 *             entry[].changes[].value envelope; one webhook may carry
 *             several messages and/or delivery-status updates.
 *
 *   generic — legacy/custom scheme kept for curl testing and internal
 *             simulators: HMAC-SHA256 of the raw body, base64-encoded, sent
 *             in X-Twilio-Signature or X-Hub-Signature-256, over a flat
 *             { from, body, ... } JSON payload.
 *
 * Verification fails closed in every mode: a missing WHATSAPP_AUTH_TOKEN or
 * missing/malformed signature header rejects the request.
 */

import crypto from 'crypto';
import { z } from 'zod';

export type WhatsAppProvider = 'meta' | 'generic';

/**
 * Read at call time (not module init) so tests can stub the env var and a
 * redeploy-free env change on the host takes effect per invocation.
 */
export function whatsappProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === 'meta' ? 'meta' : 'generic';
}

/* ─── Signature Verification ─────────────────────────────────── */

function timingSafeEqualStr(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    // Length mismatch throws — treat as verification failure.
    return false;
  }
}

/**
 * Verify the webhook signature for the active provider.
 * @param rawBody  Exact raw request body text (before any JSON.parse).
 * @param headers  Request headers (only .get is used).
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  headers: Pick<Headers, 'get'>,
): boolean {
  const authToken = process.env.WHATSAPP_AUTH_TOKEN;
  // Fail closed: a missing token is a misconfiguration, not a dev-mode pass.
  if (!authToken) return false;

  if (whatsappProvider() === 'meta') {
    const header = headers.get('x-hub-signature-256');
    if (!header || !header.startsWith('sha256=')) return false;

    const expected = crypto
      .createHmac('sha256', authToken)
      .update(rawBody)
      .digest('hex');

    return timingSafeEqualStr(header.slice('sha256='.length).toLowerCase(), expected);
  }

  // generic: base64 HMAC-SHA256 of the raw body in either header.
  const signature =
    headers.get('x-twilio-signature') || headers.get('x-hub-signature-256');
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', authToken)
    .update(rawBody)
    .digest('base64');

  return timingSafeEqualStr(signature, expected);
}

/* ─── Meta Payload Normalization ─────────────────────────────── */

/**
 * The flat message shape both webhook routes already validate and process.
 * Meta payloads are normalized into this; generic payloads already are it.
 */
export interface NormalizedInbound {
  from: string;
  body: string;
  timestamp?: string;
  ProfileName?: string;
  /** Meta media id of an accompanying photo/video/document (caption became
   * the body). Downloaded via the Graph API when WHATSAPP_ACCESS_TOKEN is set. */
  media_id?: string;
  media_mime?: string;
  /**
   * Llegó una foto SIN texto: el mensaje entero es la imagen.
   *
   * Antes esto se descartaba —se contaba en `ignored` y no llegaba a ningún
   * lado—, y con eso se descartaba el gesto más natural de bodega: sacarle una
   * foto a la etiqueta del pallet. Quien está con guantes al lado de una
   * máquina no escribe; la foto es el mensaje, y el código que trae adentro es
   * el texto que hay que leer.
   */
  media_only?: boolean;
  /**
   * El wamid de Meta. Identifica el mensaje, no la entrega -- WhatsApp
   * garantiza al-menos-una-vez, así que el mismo wamid puede llegar dos o
   * tres veces. `MetaMessageSchema` ya lo leía; vive acá para que
   * `processMessage` pueda deduplicar contra él en vez de una ventana de
   * tiempo (ver 20260906120000_wamid_es_la_llave_de_idempotencia.sql).
   */
  message_id?: string;
}

const MetaMediaSchema = z
  .object({
    id: z.string().optional(),
    caption: z.string().optional(),
    mime_type: z.string().optional(),
  })
  .passthrough();

const MetaMessageSchema = z
  .object({
    from: z.string(),
    id: z.string().optional(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: MetaMediaSchema.optional(),
    video: MetaMediaSchema.optional(),
    document: MetaMediaSchema.optional(),
  })
  .passthrough();

const MetaEnvelopeSchema = z
  .object({
    object: z.string(),
    entry: z.array(
      z
        .object({
          changes: z
            .array(
              z
                .object({
                  value: z
                    .object({
                      contacts: z
                        .array(
                          z
                            .object({
                              wa_id: z.string().optional(),
                              profile: z
                                .object({ name: z.string().optional() })
                                .passthrough()
                                .optional(),
                            })
                            .passthrough(),
                        )
                        .optional(),
                      messages: z.array(MetaMessageSchema).optional(),
                      statuses: z.array(z.unknown()).optional(),
                    })
                    .passthrough(),
                })
                .passthrough(),
            )
            .default([]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type MetaIntakeResult =
  | {
      ok: true;
      /** Text-bearing messages, normalized to the flat webhook shape. */
      messages: NormalizedInbound[];
      /** Messages skipped because they carry no processable text (e.g. media without caption, reactions, locations). */
      ignored: number;
    }
  | { ok: false; error: string };

/** Meta sends Unix seconds as a string; downstream expects ISO 8601. */
function metaTimestampToIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined;
  const seconds = Number(ts);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Flatten a Meta Cloud API webhook envelope into processable messages.
 *
 * - Delivery/read status updates (value.statuses) are valid but carry no
 *   message: they yield ok with an empty messages array — respond 200.
 * - Media messages contribute their caption as the body when present (a
 *   photo captioned "FIN OT-1234 5000 pliegos" flows through the parser);
 *   captionless media is counted in `ignored` until media download exists.
 */
export function extractMetaInbound(rawJson: unknown): MetaIntakeResult {
  const parsed = MetaEnvelopeSchema.safeParse(rawJson);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') {
    return { ok: false, error: 'Payload is not a WhatsApp Cloud API envelope' };
  }

  const messages: NormalizedInbound[] = [];
  let ignored = 0;

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const nameByWaId = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) {
          nameByWaId.set(contact.wa_id, contact.profile.name);
        }
      }

      for (const msg of value.messages ?? []) {
        const media = msg.image ?? msg.video ?? msg.document;
        const body = msg.type === 'text' ? msg.text?.body : media?.caption;

        // Una foto sin epígrafe SÍ es un mensaje procesable: el texto viene
        // dentro de la imagen, en el código de la etiqueta. Lo que se sigue
        // ignorando es lo que de verdad no dice nada — reacciones, ubicaciones,
        // acuses de entrega.
        const soloFoto = !body && !!media?.id;

        if (!body && !soloFoto) {
          ignored += 1;
          continue;
        }

        messages.push({
          // Meta sends bare digits (e.g. "56912345678"); normalize to E.164-ish.
          from: `+${msg.from}`,
          body: body ?? '',
          timestamp: metaTimestampToIso(msg.timestamp),
          ProfileName: nameByWaId.get(msg.from) ?? nameByWaId.values().next().value,
          ...(media?.id ? { media_id: media.id, media_mime: media.mime_type } : {}),
          ...(soloFoto ? { media_only: true } : {}),
          ...(msg.id ? { message_id: msg.id } : {}),
        });
      }
    }
  }

  return { ok: true, messages, ignored };
}

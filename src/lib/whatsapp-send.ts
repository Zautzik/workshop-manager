/**
 * @fileoverview WhatsApp Send — outbound messages via the Meta Cloud API.
 *
 * NEW capability: until this file, the whole WhatsApp integration was
 * inbound-only -- whatsapp-ingest.ts/whatsapp-media.ts only ever call the
 * Graph API's media-DOWNLOAD endpoint (pulling a photo the operator already
 * sent), never the send-a-message endpoint.
 *
 * Mirrors whatsapp-intake.ts's provider split: WHATSAPP_PROVIDER=meta calls
 * the real Graph API; anything else (generic/dev, or missing credentials)
 * only logs and records the attempt in whatsapp_outbound_log, so the
 * simulator and tests can assert on what WOULD have been sent without real
 * Meta traffic -- same reasoning as the existing generic inbound path.
 *
 * Meta note, unavoidable in code: outside the 24h customer-service window
 * opened by the recipient's last inbound message, only a pre-approved
 * message TEMPLATE can be sent -- a freeform body is rejected by the Graph
 * API. `body` here is the eventual template's rendered text; getting a
 * template approved is an external Meta Business process this file cannot
 * route around.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { whatsappProvider } from '@/lib/whatsapp-intake';
import { redactPhone } from '@/lib/whatsapp-ingest';
import logger from '@/lib/logger';

export interface SendResult {
  ok: boolean;
  provider: 'meta' | 'generic';
  error?: string;
}

async function sendViaMeta(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      provider: 'meta',
      error: 'WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados',
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.error({ status: res.status, body: errBody, to: redactPhone(to) }, 'WhatsApp send failed');
      return { ok: false, provider: 'meta', error: `Graph API ${res.status}` };
    }
    return { ok: true, provider: 'meta' };
  } catch (err) {
    logger.error({ err, to: redactPhone(to) }, 'WhatsApp send request failed');
    return { ok: false, provider: 'meta', error: 'Error de red enviando el mensaje' };
  }
}

/**
 * Envía un mensaje saliente de WhatsApp. Best-effort para quien llama, igual
 * que dispatchNotifications con las notificaciones en la app: un envío que
 * falla queda registrado, no revierte lo que lo disparó.
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  context?: string,
): Promise<SendResult> {
  const provider = whatsappProvider();
  const result: SendResult =
    provider === 'meta' ? await sendViaMeta(to, body) : { ok: true, provider: 'generic' };

  if (provider !== 'meta') {
    logger.info({ to: redactPhone(to), body, context }, '[whatsapp-send:generic] mensaje simulado, no se envía de verdad');
  }

  const { error } = await supabaseAdmin.from('whatsapp_outbound_log').insert({
    to_phone: to,
    body,
    provider: result.provider,
    ok: result.ok,
    error: result.error ?? null,
    context: context ?? null,
  });
  if (error) logger.error({ err: error }, 'No se pudo registrar whatsapp_outbound_log');

  return result;
}

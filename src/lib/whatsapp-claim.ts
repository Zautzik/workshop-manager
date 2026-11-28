/**
 * @fileoverview El candado de idempotencia del webhook de WhatsApp.
 *
 * Meta entrega al-menos-una-vez: si el webhook se demora o se corta, el mismo
 * mensaje (mismo wamid) vuelve a llegar. `insert_whatsapp_log_idempotent`
 * protege los partes de producción, pero corre al FINAL del pipeline y sólo
 * para start/end — una respuesta de mantención, un `cancel` o una foto se
 * volvían a ejecutar enteros en cada reentrega.
 *
 * Esto va ANTES de todo: se inserta el wamid en `whatsapp_inbound_claims` y
 * sólo quien logró insertar procesa. Decide la llave primaria, no un SELECT
 * previo — dos entregas simultáneas no pueden ganar las dos.
 *
 * Falla cerrado: si el candado no se puede tomar (base caída, migración sin
 * aplicar) se lanza, el webhook responde 500 y Meta reintenta más tarde. No
 * se procesa nada sin candado.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import logger from '@/lib/logger';

export type WhatsAppChannel = 'production' | 'warehouse';

/** Código de Postgres para violación de unicidad. */
const UNIQUE_VIOLATION = '23505';

/**
 * Toma el mensaje. `true` = es nuestro, procesarlo. `false` = otra entrega del
 * mismo wamid ya lo tomó: es un duplicado y no hay que hacer nada.
 */
export async function claimInboundMessage(
  channel: WhatsAppChannel,
  wamid: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('whatsapp_inbound_claims')
    .insert({ channel, wamid });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw new Error(`No se pudo tomar el candado del mensaje: ${error.message}`);
}

/**
 * Suelta el candado de un mensaje que NO se procesó y que el remitente va a
 * reintentar, para que ese reintento no se descarte como duplicado.
 *
 * Nunca lanza: se llama desde caminos de error, y un fallo acá no debe tapar
 * el error original. Si no se pudo soltar, el reintento se va a tragar — por
 * eso queda en el log como error y no como aviso.
 */
export async function releaseInboundMessage(
  channel: WhatsAppChannel,
  wamid: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_inbound_claims')
      .delete()
      .eq('channel', channel)
      .eq('wamid', wamid);
    if (error) throw error;
  } catch (err) {
    logger.error(
      { err, channel, wamid },
      'No se pudo soltar el candado de WhatsApp; el reintento de este mensaje se va a ignorar',
    );
  }
}

export type ClaimedOutcome<T> = { duplicate: true } | { duplicate: false; result: T };

/**
 * Corre `work` bajo el candado del wamid. Es la única forma en que un webhook
 * debería procesar un mensaje: toma, procesa, y suelta sólo si corresponde.
 *
 * - Wamid ya tomado → `{ duplicate: true }`, y `work` NO se llama.
 * - `work` lanza, o termina en 429/5xx → el candado se suelta: el mensaje no
 *   quedó procesado y el reintento tiene que poder entrar.
 * - El proceso muere por timeout a mitad de camino → el candado QUEDA y el
 *   reintento se ignora. Es a propósito: no se puede saber cuánto alcanzó a
 *   escribir la primera entrega, y repetir un cierre de mantención o un
 *   movimiento de bodega es justamente lo que esto evita.
 */
export async function runUnderClaim<T extends { status: number }>(
  channel: WhatsAppChannel,
  wamid: string,
  work: () => Promise<T>,
): Promise<ClaimedOutcome<T>> {
  if (!(await claimInboundMessage(channel, wamid))) {
    logger.info({ channel, wamid }, 'WhatsApp: reentrega de un wamid ya tomado, ignorada');
    return { duplicate: true };
  }

  let result: T;
  try {
    result = await work();
  } catch (err) {
    await releaseInboundMessage(channel, wamid);
    throw err;
  }

  if (shouldReleaseClaim(result.status)) {
    await releaseInboundMessage(channel, wamid);
  }
  return { duplicate: false, result };
}

/**
 * ¿Hay que soltar el candado después de este resultado?
 *
 * Sólo cuando el mensaje no se procesó Y un reintento podría salir distinto:
 * 429 (límite de frecuencia) y 5xx (falla nuestra). Un 400 —OT mal formada—
 * va a fallar igual la próxima vez, así que el candado se queda.
 */
export function shouldReleaseClaim(status: number): boolean {
  return status === 429 || status >= 500;
}

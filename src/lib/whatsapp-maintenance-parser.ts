/**
 * @fileoverview WhatsApp Maintenance Parser — su propio marcador de dominio.
 *
 * whatsapp-parser.ts (producción) y este parser no se pueden compartir: sus
 * vocabularios chocan a propósito -- "empecé", "listo", "terminé" aparecen
 * en los dos oficios. Resolver eso con más reglas de clasificación sería
 * agrandar un clasificador que ya es delicado; se resuelve por construcción
 * en cambio.
 *
 * Revisión (post-lanzamiento): la primera versión de este archivo exigía
 * SÓLO el código de 8 hex, sin la palabra "pauta" -- el plan original pedía
 * las dos cosas, pero se perdió en la implementación. Eso era un agujero
 * real: como 0-9 son dígitos hex válidos, cualquier número de 8 cifras en un
 * mensaje de producción normal (una fecha "20260909", un folio, una
 * cantidad) se enrutaba por error a este pipeline y desaparecía sin llegar
 * nunca al parser de producción. `extractMaintenanceCode` ahora exige las
 * dos señales -- la palabra "pauta" Y el código -- igual que
 * maintenance-notify.ts ya enseña en el mensaje saliente ("PAUTA {code}
 * LISTO"), así que un técnico real sigue funcionando exactamente igual y un
 * mensaje de producción normal (que casi nunca dice "pauta") deja de chocar.
 */

const PAUTA_KEYWORD = /\bpauta\b/;
const CODE_PATTERN = /\b([a-f0-9]{8})\b/i;

// "ok"/"okay" se sacaron a propósito: son el acuse de recibo más común de
// WhatsApp ("ok, ya voy a mirar") y no confirman que el trabajo esté hecho --
// tratarlos como cierre habría cerrado órdenes que un técnico apenas empezó
// a atender.
const LISTO_KEYWORDS = [
  'listo', 'lista', 'terminado', 'terminada', 'completado', 'completada',
  'realizado', 'realizada', 'finalizado', 'finalizada',
];

// Negación simple: "no está listo", "todavía no", "no pude dejarla lista" --
// cualquiera de estas contiene una palabra de cierre como substring, pero
// significa exactamente lo contrario. Ante la duda, se falla para el lado
// seguro (problema, la orden se queda abierta) en vez de cerrar una orden
// que en realidad no se terminó.
const NEGATION_PATTERN = /\b(no|nunca|tampoco)\b/;

function normalize(text: string): string {
  // Strip combining diacritics after NFD decomposition (U+0300-U+036F),
  // same approach as normalize() in whatsapp-parser.ts. Built from explicit
  // numeric code points via String.fromCharCode, not a literal character
  // range in source, so nothing in this file depends on how a combining
  // character happens to render/transmit.
  const accentRange = `${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}`;
  const NFD_ACCENT_RANGE = new RegExp(`[${accentRange}]`, 'g');
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(NFD_ACCENT_RANGE, '')
    .trim();
}

/**
 * El código de 8 hex que identifica la orden, sólo si el mensaje TAMBIÉN
 * dice "pauta" -- el código solo no alcanza, ver el header de este archivo.
 */
export function extractMaintenanceCode(rawMessage: string): string | null {
  const normalized = normalize(rawMessage);
  if (!PAUTA_KEYWORD.test(normalized)) return null;
  const match = rawMessage.match(CODE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

export type MaintenanceOutcome = 'listo' | 'problema';

/**
 * "PAUTA A1B2C3D4 LISTO" es la respuesta esperada, pero cualquier variante
 * con una palabra de cierre cuenta -- salvo que el mensaje también niegue
 * ("no", "nunca", "tampoco"), en cuyo caso se trata como problema sin mirar
 * más: cerrar una orden que no se cerró de verdad es el error caro acá, no
 * dejarla abierta un rato más de lo necesario.
 */
export function classifyMaintenanceReply(rawMessage: string): MaintenanceOutcome {
  const normalized = normalize(rawMessage);
  if (NEGATION_PATTERN.test(normalized)) return 'problema';
  const isListo = LISTO_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(normalized));
  return isListo ? 'listo' : 'problema';
}

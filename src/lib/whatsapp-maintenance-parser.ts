/**
 * @fileoverview WhatsApp Maintenance Parser — su propio marcador de dominio.
 *
 * whatsapp-parser.ts (producción) y este parser no se pueden compartir: sus
 * vocabularios chocan a propósito -- "empecé", "listo", "terminé" aparecen
 * en los dos oficios. Resolver eso con más reglas de clasificación sería
 * agrandar un clasificador que ya es delicado; se resuelve por construcción
 * en cambio: el aviso de pauta vencida (maintenance-notify.ts) le pide al
 * técnico un código corto de 8 caracteres hex (las primeras 8 posiciones
 * del uuid de la orden, ver shortOrderCode) -- un token que una charla de
 * producción normal no genera por azar. Si el mensaje trae ese código, es
 * de mantención; si no, no lo es, y el pipeline de producción sigue
 * exactamente igual que antes.
 */

const CODE_PATTERN = /\b([a-f0-9]{8})\b/i;

const LISTO_KEYWORDS = [
  'listo', 'lista', 'terminado', 'terminada', 'completado', 'completada',
  'hecho', 'hecha', 'ok', 'okay', 'realizado', 'realizada', 'finalizado', 'finalizada',
];

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

/** El código de 8 hex que identifica la orden, si el mensaje trae uno. */
export function extractMaintenanceCode(rawMessage: string): string | null {
  const match = rawMessage.match(CODE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

export type MaintenanceOutcome = 'listo' | 'problema';

/**
 * "LISTO A1B2C3D4" es la respuesta esperada, pero cualquier variante con una
 * palabra de cierre cuenta. Cualquier otra cosa ("no pude, falta repuesto",
 * "la cuchilla está mala") es un problema reportado, no un cierre -- la
 * orden se queda abierta para que un supervisor la vea en Órdenes.
 */
export function classifyMaintenanceReply(rawMessage: string): MaintenanceOutcome {
  const normalized = normalize(rawMessage);
  const isListo = LISTO_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(normalized));
  return isListo ? 'listo' : 'problema';
}

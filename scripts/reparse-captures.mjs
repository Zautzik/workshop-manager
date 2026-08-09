/**
 * Vuelve a leer los mensajes ya guardados con el parser corregido.
 *
 * `parsed_data` se escribió cuando «8000 pliegos fallados» se contaba como
 * producción, así que las 151 capturas de la base llevan lo que ese parser
 * entendió. El mensaje original sí está intacto en `raw_message`: re-leerlo es
 * recuperar lo que el taller ya había dicho.
 *
 *   node scripts/reparse-captures.mjs           → sólo informa, no escribe
 *   node scripts/reparse-captures.mjs --write   → aplica
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const WRITE = process.argv.includes('--write');

const { parseWhatsAppMessage } = await import('../.reparse-build/whatsapp-parser.js');

const rows = await (await fetch(`${U}/rest/v1/capture_events?select=id,raw_message,parsed_data&domain=eq.production&raw_message=not.is.null`, { headers: H })).json();

let cambian = 0, mermaNueva = 0, pliegosCorregidos = 0, horasNuevas = 0;
const ejemplos = [];
for (const r of rows) {
  const antes = r.parsed_data ?? {};
  const p = parseWhatsAppMessage(r.raw_message)?.production_data;
  if (!p) continue;
  const distinto = antes.merma !== p.merma || antes.pliegos_produced !== p.pliegos_produced || (antes.hours_reported ?? null) !== (p.hours_reported ?? null);
  if (!distinto) continue;
  cambian++;
  if (antes.merma == null && p.merma != null) mermaNueva++;
  if (antes.pliegos_produced != null && p.pliegos_produced !== antes.pliegos_produced) pliegosCorregidos++;
  if (antes.hours_reported == null && p.hours_reported != null) horasNuevas++;
  if (ejemplos.length < 5) ejemplos.push(`  "${r.raw_message.slice(0, 62)}"\n     antes  pliegos=${antes.pliegos_produced ?? '—'} merma=${antes.merma ?? '—'}\n     ahora  pliegos=${p.pliegos_produced ?? '—'} merma=${p.merma ?? '—'}`);
  if (WRITE) {
    await fetch(`${U}/rest/v1/capture_events?id=eq.${r.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ parsed_data: { ...antes, ...p } }),
    });
  }
}
console.log(`capturas revisadas: ${rows.length}`);
console.log(`  cambian:                ${cambian}`);
console.log(`  merma que se recupera:  ${mermaNueva}`);
console.log(`  pliegos corregidos:     ${pliegosCorregidos}`);
console.log(`  horas que se recuperan: ${horasNuevas}`);
console.log('\nejemplos:'); ejemplos.forEach(e => console.log(e));
console.log(WRITE ? '\nESCRITO.' : '\n(simulación — usar --write para aplicar)');

// Escribe `ots.route_steps` en las OT que no la declararon (anteriores a la
// migración 20261111130000), con la ruta que hasta hoy se deducía de su ficha
// (`inferRoute`). Desde ahí la ruta es un dato de la OT, no una adivinanza.
// Idempotente: no toca las que ya tienen ruta.
//
//   npx tsx --env-file=.env.local scripts/backfill-route-steps.mts   # local
//   npx tsx --env-file=.env scripts/backfill-route-steps.mts         # nube
import { supabaseAdmin } from '@/integrations/supabase/server';
import { inferRoute, type RouteOT } from '@/lib/production-route';

const FIELDS =
	'id, status, quantity, product_type, color_front, color_back, calc_sheets, calc_print_hours, calc_finish_hours, ' +
	'assigned_machine_id, die_id, die_code, finish_troquelado, finish_plegado, finish_pegado, finish_laminado, ' +
	'finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion';

const { data: machines, error: mErr } = await supabaseAdmin.from('machines').select('id, type');
if (mErr) throw mErr;
const machineTypeById = new Map((machines ?? []).map((m) => [m.id, m.type as string]));

// Las OT que ya pasaron por digital u offset dicen por cuál fue, mejor que su máquina asignada.
const printedOn = new Map<string, string>();
for (let from = 0; ; from += 1000) {
	const { data, error } = await supabaseAdmin
		.from('ot_status_history')
		.select('ot_id, to_status')
		.in('to_status', ['digital_printing', 'offset_printing'])
		.range(from, from + 999);
	if (error) throw error;
	for (const h of data ?? []) printedOn.set(h.ot_id, h.to_status);
	if (!data || data.length < 1000) break;
}

let updated = 0, failed = 0;
const byRoute = new Map<string, number>();
for (let from = 0; ; from += 500) {
	const { data, error } = await supabaseAdmin.from('ots').select(FIELDS).is('route_steps', null).range(0, 499);
	if (error) throw error;
	const rows = (data ?? []) as unknown as RouteOT[];
	if (rows.length === 0) break;
	for (const ot of rows) {
		const status = printedOn.get(ot.id) ?? ot.status;
		const keys = inferRoute({ ...ot, status }, machineTypeById).map((s) => s.key);
		const { error: uErr } = await supabaseAdmin.from('ots').update({ route_steps: keys }).eq('id', ot.id);
		if (uErr) { failed++; console.error(ot.id, uErr.message); continue; }
		updated++;
		const k = keys.join(' → ');
		byRoute.set(k, (byRoute.get(k) ?? 0) + 1);
	}
	if (failed > 0 || rows.length < 500) break;
	void from;
}
console.log(JSON.stringify({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, updated, failed, routes: Object.fromEntries([...byRoute].sort((a, b) => b[1] - a[1]).slice(0, 8)) }, null, 1));
if (failed > 0) process.exit(1);

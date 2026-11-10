// Re-valoriza el tiempo de máquina de toda OT con pasadas (stage-valuation.ts).
// Idempotente. Correr después de una migración que crea o cambia pasadas —
// p. ej. 20261110120000, que convierte las horas de la siembra en pasadas:
//
//   npx tsx --env-file=.env.local scripts/value-stage-passes.mts   # local
//   npx tsx --env-file=.env scripts/value-stage-passes.mts         # nube
//
// (.env.local gana sobre .env: para la nube, que no exista o usar db:use:cloud.)
import { supabaseAdmin } from '@/integrations/supabase/server';
import { valueStagePasses } from '@/lib/stage-valuation';

async function machineActual() {
	let total = 0;
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabaseAdmin
			.from('ot_cost_lines').select('total').eq('kind', 'actual').eq('category', 'machine').range(from, from + 999);
		if (error) throw error;
		total += (data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
		if (!data || data.length < 1000) return Math.round(total);
	}
}

const ids = new Set<string>();
for (let from = 0; ; from += 1000) {
	const { data, error } = await supabaseAdmin.from('ot_stage_reports').select('ot_id').range(from, from + 999);
	if (error) throw error;
	for (const r of data ?? []) ids.add(r.ot_id);
	if (!data || data.length < 1000) break;
}

const before = await machineActual();
let valued = 0, assumed = 0, failed = 0;
for (const id of ids) {
	try {
		const r = await valueStagePasses(id);
		valued += r.valued;
		if (r.assumed) assumed++;
	} catch (e) {
		failed++;
		console.error(id, (e as Error).message);
	}
}
const after = await machineActual();
console.log(JSON.stringify({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, ots: ids.size, passesValued: valued, otsWithAssumedRate: assumed, failed, machineActualBefore: before, machineActualAfter: after }));
if (failed > 0) process.exit(1);

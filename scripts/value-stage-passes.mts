// Re-valoriza el tiempo de máquina y la mano de obra de toda OT con pasadas
// (stage-valuation.ts). Idempotente. Correr después de una migración que crea
// o cambia pasadas, o cuando se corrige la dotación de Planta:
//
//   npx tsx --env-file=.env.local scripts/value-stage-passes.mts   # local
//   npx tsx --env-file=.env scripts/value-stage-passes.mts         # nube
//
// (.env.local gana sobre .env: para la nube, que no exista o usar db:use:cloud.)
import { supabaseAdmin } from '@/integrations/supabase/server';
import { valueStagePasses } from '@/lib/stage-valuation';

async function actual(category: 'machine' | 'labor') {
	let total = 0;
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabaseAdmin
			.from('ot_cost_lines').select('total').eq('kind', 'actual').eq('category', category).range(from, from + 999);
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

const before = { machine: await actual('machine'), labor: await actual('labor') };
let valued = 0, assumed = 0, failed = 0, uncoveredHours = 0, otsUncovered = 0, missingRates = 0;
for (const id of ids) {
	try {
		const r = await valueStagePasses(id);
		valued += r.valued;
		if (r.assumed) assumed++;
		uncoveredHours += r.laborUncoveredHours;
		if (r.laborUncoveredHours > 0) otsUncovered++;
		missingRates += r.laborMissingRates;
	} catch (e) {
		failed++;
		console.error(id, (e as Error).message);
	}
}
const after = { machine: await actual('machine'), labor: await actual('labor') };
console.log(JSON.stringify({
	url: process.env.NEXT_PUBLIC_SUPABASE_URL,
	ots: ids.size,
	passesValued: valued,
	otsWithAssumedRate: assumed,
	failed,
	before,
	after,
	// Horas de pasada sin gente asignada en Planta a esa máquina y turno.
	labor: { uncoveredHours: Math.round(uncoveredHours * 100) / 100, otsUncovered, linesWithoutRate: missingRates },
}));
if (failed > 0) process.exit(1);

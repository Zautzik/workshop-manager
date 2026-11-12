import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { STAGE_PASS_REF } from '@/lib/stage-valuation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/labor-margin — la mano de obra por OT, desde el libro.
 *
 * La mano de obra real de una OT es la gente que Planta asignó a la máquina,
 * por las horas que la OT estuvo en su turno, y se escribe en `ot_cost_lines`
 * al cerrar cada pasada (stage-valuation.ts, regla del dueño 2026-11-11). Esta
 * pestaña lee ESAS líneas: las mismas que suma el margen de Rentabilidad.
 *
 * Antes recalculaba la mano de obra por su cuenta desde las marcas del kiosco
 * (labor-attribution.ts) — una segunda verdad que no coincidía con el margen
 * y que, sin marcas de reloj, dejaba la pestaña vacía aunque el libro tuviera
 * la mano de obra cargada (2026-11-12).
 *
 * DIAGNÓSTICO. Cuando no hay filas, dice POR QUÉ: no hay pasadas cerradas con
 * horas, o las pasadas cayeron en turnos sin gente asignada en Planta, o
 * faltan tarifas.
 */

/** «Mano de obra — Ana Soto (2 h, turno Mañana 2026-11-12)» → «Ana Soto». */
const personOf = (description: string): string | null => {
	const m = /^Mano de obra — (.+?) \(/.exec(description ?? '');
	return m ? m[1] : null;
};

export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const otId = searchParams.get('ot_id');

	const linesPage = (desde: number, hasta: number) => {
		let q = supabaseAdmin
			.from('ot_cost_lines')
			.select('ot_id, ref_id, description, quantity, unit_cost, total, occurred_at')
			.eq('kind', 'actual')
			.eq('category', 'labor')
			.eq('ref_type', STAGE_PASS_REF);
		if (from) q = q.gte('occurred_at', from);
		if (to) q = q.lte('occurred_at', `${to}T23:59:59.999Z`);
		if (otId) q = q.eq('ot_id', otId);
		return q.range(desde, hasta) as any;
	};
	const passesPage = (desde: number, hasta: number) => {
		let q = supabaseAdmin.from('ot_stage_reports').select('id, ot_id').gt('hours', 0);
		if (from) q = q.gte('created_at', from);
		if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
		if (otId) q = q.eq('ot_id', otId);
		return q.range(desde, hasta) as any;
	};

	let lines: any[];
	let passes: any[];
	let ratesCount: number;
	try {
		const [l, p, r] = await Promise.all([
			fetchAll<any>(linesPage),
			fetchAll<any>(passesPage),
			supabaseAdmin.from('compensation_rates').select('id', { count: 'exact', head: true }),
		]);
		if (r.error) throw new Error(r.error.message);
		lines = l.rows;
		passes = p.rows;
		ratesCount = r.count ?? 0;
	} catch (err) {
		return NextResponse.json(
			{ error: `No se pudo leer la mano de obra: ${err instanceof Error ? err.message : 'error desconocido'}` },
			{ status: 500 },
		);
	}

	const passesWithLabor = new Set(lines.map((l) => l.ref_id));
	const reasons: string[] = [];
	if (passes.length === 0) {
		reasons.push('No hay etapas cerradas con horas en el período: la mano de obra se carga al cerrar la etapa.');
	} else if (passesWithLabor.size === 0) {
		reasons.push(
			`Ninguna de las ${passes.length} etapas cerradas cayó en un turno con gente asignada a su máquina en Planta. ` +
				'Sin dotación no se sabe quién trabajó: se completa asignando personal a la máquina en Planta.',
		);
	}
	if (ratesCount === 0) {
		reasons.push('No hay tarifas por hora cargadas: sin ellas las horas no se pueden convertir a plata.');
	}

	// Agrupado por OT.
	const byOt = new Map<string, { hours: number; cost: number; people: Set<string> }>();
	for (const l of lines) {
		const g = byOt.get(l.ot_id) ?? { hours: 0, cost: 0, people: new Set<string>() };
		g.hours += Number(l.quantity ?? 0);
		g.cost += Number(l.total ?? 0);
		const who = personOf(l.description);
		if (who) g.people.add(who);
		byOt.set(l.ot_id, g);
	}

	const otIds = [...byOt.keys()];
	const otById = new Map<string, any>();
	// De a 100: una lista de cientos de ids no entra en la URL del pedido.
	for (let i = 0; i < otIds.length; i += 100) {
		const { data, error } = await supabaseAdmin
			.from('ots')
			.select('id, ot_number, client_name, total_price')
			.in('id', otIds.slice(i, i + 100));
		if (error) return NextResponse.json({ error: `No se pudieron leer las OT: ${error.message}` }, { status: 500 });
		for (const o of data ?? []) otById.set(o.id, o);
	}

	const rows = [...byOt.entries()]
		.map(([ot_id, g]) => {
			const o = otById.get(ot_id);
			const revenue = Number(o?.total_price ?? 0);
			return {
				ot_id,
				ot_number: o?.ot_number ?? null,
				client_name: o?.client_name ?? null,
				revenue,
				total_hours: Math.round(g.hours * 100) / 100,
				// Las horas extra no se separan todavía: la línea va a la tarifa base.
				overtime_hours: 0,
				total_labor_cost: Math.round(g.cost),
				labor_pct_of_revenue: revenue > 0 ? Math.round((g.cost / revenue) * 1000) / 10 : null,
				people: [...g.people],
			};
		})
		.sort((a, b) => b.total_labor_cost - a.total_labor_cost);

	return NextResponse.json({
		rows,
		warnings: [],
		unattributed_hours: null,
		diagnostics: {
			passes_with_hours: passes.length,
			passes_with_labor: passesWithLabor.size,
			rates: ratesCount,
			blocked: reasons.length > 0 && rows.length === 0,
			reasons,
		},
	});
}

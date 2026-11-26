import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { STAGE_PASS_REF } from '@/lib/stage-valuation';
import { personOfLaborLine } from '@/lib/labor-line';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/labor-by-person?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Horas trabajadas por persona en el período, desde el libro: las mismas
 * líneas de mano de obra que stage-valuation.ts escribe al cerrar cada pasada
 * y que suman el margen de Rentabilidad y la pestaña Mano de obra. Reemplaza
 * en Consola al "Rating", que era el 75 por defecto de una columna que nadie
 * escribe (auditoría C4, 2026-11-25).
 *
 * Sin `from`/`to`: el mes en curso.
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const now = new Date();
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
	const from = searchParams.get('from') || monthStart;
	const to = searchParams.get('to');

	const page = (desde: number, hasta: number) => {
		let q = supabaseAdmin
			.from('ot_cost_lines')
			.select('description, quantity, total')
			.eq('kind', 'actual')
			.eq('category', 'labor')
			.eq('ref_type', STAGE_PASS_REF)
			.gte('occurred_at', from);
		if (to) q = q.lte('occurred_at', `${to}T23:59:59.999Z`);
		return q.range(desde, hasta) as any;
	};

	try {
		const [{ rows }, people] = await Promise.all([
			fetchAll<{ description: string; quantity: number | null; total: number | null }>(page),
			supabaseAdmin.from('employees').select('id, full_name'),
		]);
		if (people.error) throw new Error(people.error.message);

		// The line carries the name the writer looked up from employees.full_name;
		// names are unique today (43 of 43), so the name maps back to one person.
		const idByName = new Map((people.data ?? []).map((p) => [p.full_name as string, p.id as string]));
		const byPerson = new Map<string, { employee_id: string | null; name: string; hours: number; cost: number }>();
		for (const l of rows) {
			const name = personOfLaborLine(l.description);
			if (!name) continue;
			const g = byPerson.get(name) ?? { employee_id: idByName.get(name) ?? null, name, hours: 0, cost: 0 };
			g.hours += Number(l.quantity ?? 0);
			g.cost += Number(l.total ?? 0);
			byPerson.set(name, g);
		}

		const result = [...byPerson.values()]
			.map((g) => ({ ...g, hours: Math.round(g.hours * 100) / 100, cost: Math.round(g.cost) }))
			.sort((a, b) => b.hours - a.hours);
		return NextResponse.json({ from, to: to ?? null, people: result });
	} catch (err) {
		return NextResponse.json(
			{ error: `No se pudieron leer las horas: ${err instanceof Error ? err.message : 'error desconocido'}` },
			{ status: 500 },
		);
	}
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { measureAjuste, plantDate, type AjusteAssignment, type AjusteReport } from '@/lib/ajuste';

export const dynamic = 'force-dynamic';

/**
 * GET /api/machines/[id]/ajuste — el ajuste MEDIDO de una prensa.
 *
 * Lo que los operarios declararon al cerrar offset en esta máquina, en total y
 * por operario (`measureAjuste`). Se muestra en la ficha de la máquina al lado
 * del valor editable: un ajuste fijado hace meses y ya desmentido por el taller
 * tiene que verse, no quedar mandando en silencio.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'supervisor', 'manager']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'ID de máquina inválido' }, { status: 400 });
	}

	try {
		// `*`: `ajuste_minutes` llega con una migración; antes de que esté, la
		// respuesta es simplemente "sin mediciones" en vez de un error.
		const { rows } = await fetchAll<any>((desde, hasta) =>
			supabaseAdmin.from('ot_stage_reports').select('*').eq('machine_id', id).range(desde, hasta) as any,
		);
		const reports: AjusteReport[] = rows.filter((r) => r.ajuste_minutes > 0);
		if (reports.length === 0) return NextResponse.json({ measured: null, byOperator: [] });

		const since = reports.map((r) => plantDate(r.created_at)).sort()[0];
		const { rows: assignments } = await fetchAll<AjusteAssignment>((desde, hasta) =>
			supabaseAdmin
				.from('worker_assignments')
				.select('employee_id, machine_id, date, ot_id')
				.eq('machine_id', id)
				.gte('date', since)
				.range(desde, hasta) as any,
		);
		const ids = [
			...new Set([
				...assignments.map((a) => a.employee_id),
				...reports.map((r) => r.operator_employee_id).filter((x): x is string => !!x),
			]),
		];
		const names = new Map<string, string>();
		if (ids.length > 0) {
			const { data, error } = await supabaseAdmin.from('employees').select('id, full_name').in('id', ids);
			if (error) throw new Error(error.message);
			for (const e of data ?? []) names.set(e.id, e.full_name);
		}

		const result = measureAjuste(reports, assignments, names)[id] ?? { measured: null, byOperator: [] };
		return NextResponse.json(result);
	} catch (error) {
		console.error('Error measuring ajuste:', error);
		return NextResponse.json({ error: 'No se pudo medir el ajuste' }, { status: 500 });
	}
}

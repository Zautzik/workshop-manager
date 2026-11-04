import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { plantDate } from '@/lib/ajuste';
import { loadRotations, rotationDb } from '@/lib/rotation-store';
import { addDays, decideRotationWrites, mondayOf, planRotation } from '@/lib/shift-rotation';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
	/** Cualquier día de la primera semana a generar. Por defecto, esta semana. */
	from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	weeks: z.number().int().min(1).max(8).default(4),
	/** Una sola rotación; sin esto, todas las activas. */
	rotation_id: z.string().uuid().optional(),
});

const REASON_LABEL = { manual: 'tiene un cambio hecho a mano', licencia: 'tiene licencia o vacaciones', quitado: 'se lo quitaron a mano' } as const;

/**
 * POST — escribe los turnos que piden las rotaciones, de HOY en adelante.
 *
 * Son filas normales de `worker_assignments` marcadas 'rotacion': las leen el
 * Kanban, el Cronograma y la nómina como cualquier turno. Lo que hizo una persona
 * manda (`decideRotationWrites`), y cada fila pasa por la compuerta de
 * cumplimiento: si el contrato no la admite (descanso, horas), no entra y la
 * respuesta dice por qué.
 */
export async function POST(req: NextRequest) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
	if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

	try {
		const all = await loadRotations();
		if (all === null) return NextResponse.json({ error: 'Falta aplicar la migración de rotaciones (20261103120000).' }, { status: 503 });
		const rotations = all.filter((r) => r.active && (!parsed.data.rotation_id || r.id === parsed.data.rotation_id));
		if (rotations.length === 0) return NextResponse.json({ created: 0, removed: 0, skipped: [], rejected: [], from: null, to: null });

		const today = plantDate(new Date().toISOString());
		const firstMonday = mondayOf(parsed.data.from ?? today);
		const from = firstMonday < today ? today : firstMonday;
		const to = addDays(firstMonday, parsed.data.weeks * 7 - 1);

		const planned = rotations.flatMap((r) => planRotation(r, from, to));
		const employeeIds = [...new Set(rotations.flatMap((r) => r.teams.flatMap((t) => t.members.map((m) => m.employee_id))))];
		if (employeeIds.length === 0) return NextResponse.json({ created: 0, removed: 0, skipped: [], rejected: [], from, to });

		const [{ rows: existing }, skipsRes, leavesRes, namesRes] = await Promise.all([
			fetchAll<any>((desde, hasta) =>
				supabaseAdmin.from('worker_assignments').select('*').in('employee_id', employeeIds).gte('date', from).lte('date', to).range(desde, hasta) as any,
			),
			rotationDb('rotation_skips').select('rotation_id, employee_id, date').gte('date', from).lte('date', to),
			supabaseAdmin.from('leave_requests').select('employee_id, start_date, end_date').eq('status', 'approved').in('employee_id', employeeIds).lte('start_date', to).gte('end_date', from),
			supabaseAdmin.from('employees').select('id, full_name').in('id', employeeIds),
		]);
		for (const r of [skipsRes, leavesRes, namesRes]) if (r.error) throw new Error(r.error.message);
		const name = new Map(((namesRes.data ?? []) as any[]).map((e) => [e.id, e.full_name as string]));

		const { remove, insert, skipped } = decideRotationWrites({
			planned,
			existing: existing.map((e: any) => ({ id: e.id, employee_id: e.employee_id, date: e.date, source: e.source, rotation_id: e.rotation_id })),
			rotationIds: rotations.map((r) => r.id),
			skips: (skipsRes.data ?? []) as any[],
			leaves: (leavesRes.data ?? []) as any[],
		});

		for (let i = 0; i < remove.length; i += 100) {
			const { error } = await supabaseAdmin.from('worker_assignments').delete().in('id', remove.slice(i, i + 100));
			if (error) throw new Error(error.message);
		}

		// De a una: la compuerta revisa cada fila contra las anteriores, y un rechazo
		// (descanso, tope de horas) no debe tumbar el resto de la semana.
		const rejected: Array<{ employee: string; date: string; reason: string }> = [];
		let created = 0;
		for (const p of insert) {
			const { error } = await supabaseAdmin.from('worker_assignments').insert({
				employee_id: p.employee_id,
				machine_id: p.machine_id,
				shift_id: p.shift_id,
				date: p.date,
				role: p.role,
				ot_id: null,
				hours_worked: 0,
				source: 'rotacion',
				rotation_id: p.rotation_id,
			} as never);
			if (error) rejected.push({ employee: name.get(p.employee_id) ?? p.employee_id, date: p.date, reason: error.message });
			else created++;
		}

		return NextResponse.json({
			from,
			to,
			created,
			removed: remove.length,
			skipped: skipped.map((s) => ({ employee: name.get(s.employee_id) ?? s.employee_id, date: s.date, reason: REASON_LABEL[s.reason] })),
			rejected,
		});
	} catch (error) {
		console.error('Error generating rotations:', error);
		return NextResponse.json({ error: 'No se pudieron generar los turnos de la rotación' }, { status: 500 });
	}
}

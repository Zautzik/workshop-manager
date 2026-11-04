import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { plantDate } from '@/lib/ajuste';
import { loadRotations, rotationDb } from '@/lib/rotation-store';
import { mondayOf, validateRotation, type Rotation } from '@/lib/shift-rotation';

export const dynamic = 'force-dynamic';

/**
 * Rotaciones de turno (`shift-rotation.ts`): los equipos que se cambian de
 * turno cada lunes. Se arman una vez desde Planta; los turnos de cada semana los
 * escribe `POST /api/shift-rotations/generate`.
 */

export async function GET() {
	const auth = await requireAuth(['admin', 'supervisor', 'manager']);
	if (isAuthError(auth)) return auth;
	try {
		const rotations = await loadRotations();
		return NextResponse.json({ available: rotations !== null, rotations: rotations ?? [] });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
	}
}

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RotationSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1).max(80),
	shift_ids: z.array(z.string().uuid()).min(1).max(4),
	weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
	saturday_shift_id: z.string().uuid().nullable(),
	/** Cualquier día de la semana de referencia; se guarda su lunes. */
	anchor_week: ISO_DATE,
	active: z.boolean(),
	teams: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(60),
				members: z
					.array(z.object({ employee_id: z.string().uuid(), machine_id: z.string().uuid(), role: z.string().trim().min(1).max(60) }))
					.max(40),
			}),
		)
		.min(1)
		.max(6),
});

/** PUT — crea o reemplaza una rotación entera (la pantalla siempre manda todo). */
export async function PUT(req: NextRequest) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = RotationSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}
	const input = parsed.data;

	try {
		const existing = await loadRotations();
		if (existing === null) {
			return NextResponse.json({ error: 'Falta aplicar la migración de rotaciones (20261103120000).' }, { status: 503 });
		}

		// Sólo definiciones vigentes: una rotación sobre una fila archivada no abriría nada.
		const { data: shifts, error: shiftErr } = await supabaseAdmin.from('shifts').select('*');
		if (shiftErr) throw new Error(shiftErr.message);
		const valid = new Set(((shifts ?? []) as any[]).filter((s) => s.code && !s.archived_at).map((s) => s.id));
		const usedShifts = [...input.shift_ids, ...(input.saturday_shift_id ? [input.saturday_shift_id] : [])];
		if (usedShifts.some((id) => !valid.has(id))) {
			return NextResponse.json({ error: 'Uno de los turnos no es una definición vigente.' }, { status: 400 });
		}

		const candidate: Rotation = {
			id: input.id ?? 'nueva',
			name: input.name,
			shift_ids: input.shift_ids,
			weekdays: [...new Set(input.weekdays)].sort(),
			saturday_shift_id: input.saturday_shift_id,
			anchor_week: mondayOf(input.anchor_week),
			active: input.active,
			teams: input.teams.map((t, position) => ({ id: `t${position}`, name: t.name, position, members: t.members })),
		};
		const problems = validateRotation(candidate, existing);
		if (problems.length > 0) return NextResponse.json({ error: problems.join(' '), problems }, { status: 400 });

		const row = {
			name: candidate.name,
			shift_ids: candidate.shift_ids,
			weekdays: candidate.weekdays,
			saturday_shift_id: candidate.saturday_shift_id,
			anchor_week: candidate.anchor_week,
			active: candidate.active,
		};
		let rotationId = input.id;
		if (rotationId) {
			const { error } = await rotationDb('shift_rotations').update(row).eq('id', rotationId);
			if (error) throw new Error(error.message);
			// Los equipos se reescriben enteros: borrarlos borra sus miembros (cascade).
			const { error: delErr } = await rotationDb('rotation_teams').delete().eq('rotation_id', rotationId);
			if (delErr) throw new Error(delErr.message);
		} else {
			const { data, error } = await rotationDb('shift_rotations').insert(row).select('id').single();
			if (error) throw new Error(error.message);
			rotationId = data.id as string;
		}

		for (const [position, team] of input.teams.entries()) {
			const { data: t, error } = await rotationDb('rotation_teams')
				.insert({ rotation_id: rotationId, name: team.name, position })
				.select('id')
				.single();
			if (error) throw new Error(error.message);
			if (team.members.length > 0) {
				const { error: mErr } = await rotationDb('rotation_members').insert(team.members.map((m) => ({ ...m, team_id: t.id })));
				if (mErr) throw new Error(mErr.message);
			}
		}

		const saved = (await loadRotations())?.find((r) => r.id === rotationId) ?? null;
		return NextResponse.json({ rotation: saved });
	} catch (error) {
		console.error('Error saving rotation:', error);
		return NextResponse.json({ error: 'No se pudo guardar la rotación' }, { status: 500 });
	}
}

/**
 * DELETE ?id= — borra la rotación y los turnos que generó de HOY EN ADELANTE. Los
 * pasados quedan: son lo que se trabajó y lo que paga la nómina.
 */
export async function DELETE(req: NextRequest) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const id = new URL(req.url).searchParams.get('id');
	if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
	const { error: futureErr } = await (supabaseAdmin as any)
		.from('worker_assignments')
		.delete()
		.eq('rotation_id', id)
		.eq('source', 'rotacion')
		.gte('date', plantDate(new Date().toISOString()));
	if (futureErr) return NextResponse.json({ error: futureErr.message }, { status: 500 });
	const { error } = await rotationDb('shift_rotations').delete().eq('id', id);
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true });
}

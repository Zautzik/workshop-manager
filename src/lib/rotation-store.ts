/**
 * Leer las rotaciones de la base (servidor). Lo comparten la ruta que las edita
 * y la que genera los turnos, para que las dos vean exactamente lo mismo.
 *
 * `null` si las tablas todavía no existen (antes de la migración 20261103120000):
 * Planta lo dice en vez de romperse.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Rotation } from '@/lib/shift-rotation';

// Las tablas llegan con la migración 20261103120000 y todavía no están en los tipos generados.
export const rotationDb = (table: 'shift_rotations' | 'rotation_teams' | 'rotation_members' | 'rotation_skips') =>
	(supabaseAdmin as any).from(table);

export async function loadRotations(): Promise<Rotation[] | null> {
	const { data: rotations, error } = await rotationDb('shift_rotations').select('*').order('created_at');
	if (error) {
		console.warn('Sin rotaciones (¿falta la migración?):', error.message);
		return null;
	}
	const ids = (rotations ?? []).map((r: any) => r.id);
	if (ids.length === 0) return [];

	const { data: teams, error: teamErr } = await rotationDb('rotation_teams').select('*').in('rotation_id', ids).order('position');
	if (teamErr) throw new Error(teamErr.message);
	const teamIds = (teams ?? []).map((t: any) => t.id);
	const { data: members, error: memberErr } =
		teamIds.length > 0 ? await rotationDb('rotation_members').select('*').in('team_id', teamIds) : { data: [], error: null };
	if (memberErr) throw new Error(memberErr.message);

	return (rotations ?? []).map((r: any) => ({
		id: r.id,
		name: r.name,
		shift_ids: r.shift_ids ?? [],
		weekdays: r.weekdays ?? [1, 2, 3, 4, 5],
		saturday_shift_id: r.saturday_shift_id ?? null,
		anchor_week: String(r.anchor_week).slice(0, 10),
		active: r.active !== false,
		teams: (teams ?? [])
			.filter((t: any) => t.rotation_id === r.id)
			.map((t: any) => ({
				id: t.id,
				name: t.name,
				position: t.position,
				members: (members ?? [])
					.filter((m: any) => m.team_id === t.id)
					.map((m: any) => ({ employee_id: m.employee_id, machine_id: m.machine_id, role: m.role })),
			})),
	}));
}

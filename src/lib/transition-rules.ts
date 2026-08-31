import { supabaseAdmin } from '@/integrations/supabase/server';
import type { AppRole } from '@/types/app-role';
import { DEFAULT_ROLE_ACCESS, isValidStatus, type OTWorkflowStatus } from '@/lib/ot-state-machine';

const ALL_ROLES: readonly AppRole[] = ['admin', 'supervisor', 'manager', 'hr_manager', 'technician', 'vendedor'];

/**
 * A qué estados puede mover una OT cada rol, leído de `ot_role_transitions`.
 *
 * Semántica todo-o-nada, no por rol: si la tabla tiene alguna fila, ES el
 * mapa completo — un rol sin fila ahí queda en `[]`. Si está vacía (antes de
 * sembrarla, o si la consulta falla), se usa `DEFAULT_ROLE_ACCESS` entero como
 * red de seguridad. Un mapa mitad-tabla mitad-código sería imposible de
 * auditar: nadie podría mirar una sola fuente y saber qué puede hacer un rol.
 */
export async function loadRoleAccess(): Promise<Record<AppRole, OTWorkflowStatus[]>> {
	try {
		const { data, error } = await supabaseAdmin.from('ot_role_transitions').select('role, to_status');
		if (error || !data || data.length === 0) return DEFAULT_ROLE_ACCESS;

		const map = Object.fromEntries(ALL_ROLES.map((r) => [r, [] as OTWorkflowStatus[]])) as Record<
			AppRole,
			OTWorkflowStatus[]
		>;
		for (const row of data as Array<{ role: string; to_status: string }>) {
			if ((ALL_ROLES as readonly string[]).includes(row.role) && isValidStatus(row.to_status)) {
				map[row.role as AppRole].push(row.to_status);
			}
		}
		return map;
	} catch {
		return DEFAULT_ROLE_ACCESS;
	}
}

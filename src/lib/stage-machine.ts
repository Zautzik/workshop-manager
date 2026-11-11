/**
 * En qué máquina corrió una etapa.
 *
 * La pasada guardaba siempre la máquina ASIGNADA a la OT —la prensa—, también
 * para el primer corte, el troquel o el taller. Mientras sólo servía para la
 * tarifa (que se elige por etapa) no se notaba; con la mano de obra deducida
 * de Planta (labor-from-shifts.ts) sí: la gente de la prensa cargaba las horas
 * de la guillotina.
 *
 * La máquina de una etapa es, en orden:
 *   1. la asignada, si es del tipo que hace la etapa;
 *   2. la que el plan agendó para esa etapa (ot_machine_schedule);
 *   3. la única máquina activa de ese tipo;
 *   4. entre varias, la única que Planta tenía con gente (lo resuelve quien
 *      tiene la dotación: stage-valuation.ts);
 *   5. ninguna: no se adivina.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { PLAN_STEPS } from '@/lib/production-route';

export interface MachineRow {
	id: string;
	type: string;
	is_active?: boolean | null;
}

export interface ScheduleRow {
	machine_id: string;
	plan_step?: string | null;
	scheduled_start?: string | null;
}

/** Los tipos de máquina que hacen las etapas que viven en esta columna del Tablero. */
export function stageMachineTypes(workflowStep: string): string[] {
	return [...new Set(PLAN_STEPS.filter((s) => s.status === workflowStep).flatMap((s) => s.machineTypes))];
}

/**
 * Las máquinas candidatas para la pasada, de la más a la menos segura. Una
 * sola = esa. Varias = hay que desempatar (con la dotación). Ninguna = no se
 * sabe.
 */
export function passMachineCandidates(args: {
	workflowStep: string;
	assignedMachineId: string | null | undefined;
	machines: MachineRow[];
	schedule?: ScheduleRow[];
}): string[] {
	const types = stageMachineTypes(args.workflowStep);
	if (types.length === 0) return [];
	const typeById = new Map(args.machines.map((m) => [m.id, m.type]));
	const fits = (id: string | null | undefined) => !!id && types.includes(typeById.get(id) ?? '');

	if (fits(args.assignedMachineId)) return [args.assignedMachineId as string];

	const planSteps = new Set(PLAN_STEPS.filter((s) => s.status === args.workflowStep).map((s) => s.key as string));
	const scheduled = (args.schedule ?? [])
		.filter((s) => fits(s.machine_id) && (!s.plan_step || planSteps.has(s.plan_step)))
		.sort((a, b) => String(b.scheduled_start ?? '').localeCompare(String(a.scheduled_start ?? '')));
	if (scheduled.length > 0) return [scheduled[0].machine_id];

	return args.machines.filter((m) => types.includes(m.type) && m.is_active !== false).map((m) => m.id);
}

/**
 * La máquina que se guarda en una pasada nueva: la única candidata, o `null`
 * si hay varias (la valorización desempata con la dotación de Planta) o
 * ninguna. Nunca la prensa para una etapa que no es de prensa.
 */
export async function resolvePassMachine(
	otId: string,
	workflowStep: string,
	assignedMachineId: string | null | undefined,
): Promise<string | null> {
	if (stageMachineTypes(workflowStep).length === 0) return null;
	const [machinesRes, scheduleRes] = await Promise.all([
		supabaseAdmin.from('machines').select('id, type, is_active'),
		supabaseAdmin.from('ot_machine_schedule').select('machine_id, plan_step, scheduled_start').eq('ot_id', otId),
	]);
	if (machinesRes.error || scheduleRes.error) return null;
	const candidates = passMachineCandidates({
		workflowStep,
		assignedMachineId,
		machines: (machinesRes.data ?? []) as MachineRow[],
		schedule: (scheduleRes.data ?? []) as ScheduleRow[],
	});
	return candidates.length === 1 ? candidates[0] : null;
}

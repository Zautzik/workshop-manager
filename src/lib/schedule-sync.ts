/**
 * Hilo dorado entre el programa (`ot_machine_schedule`) y la OT
 * (`ots.assigned_machine_id`).
 *
 * La máquina de una OT vive en dos lugares: la agenda y la asignación que leen
 * el Kanban, Órdenes en Proceso, Planta, la compuerta de Pre-Prensa y el
 * costeo. Mover la impresión a otra prensa en el Cronograma y que el resto de
 * la app siguiera diciendo la prensa anterior sería otra vez "dos puertas para
 * el mismo trabajo" (NOTES.md).
 *
 * - Bloque de impresión (`plan_step` offset/digital): ES la decisión de qué
 *   prensa hace el trabajo, así que pisa la asignación.
 * - Cualquier otra etapa (guillotina, taller, despacho): no toca la
 *   asignación — un corte final en la guillotina no cambia en qué prensa se
 *   imprimió.
 * - Sin `plan_step` (Hoja de Producción, filas antiguas): el criterio previo,
 *   fijar sólo si estaba vacía (auditoría 2026-08-31).
 */

import { supabaseAdmin } from '@/integrations/supabase/server';

const PRINT_STEPS = new Set(['offset', 'digital']);

export async function syncAssignedMachine(otId: string, machineId: string, planStep: string | null): Promise<void> {
	if (planStep && !PRINT_STEPS.has(planStep)) return;

	let query = supabaseAdmin.from('ots').update({ assigned_machine_id: machineId }).eq('id', otId);
	if (!planStep) query = query.is('assigned_machine_id', null);

	const { error } = await query;
	if (error) console.warn('No se pudo sincronizar assigned_machine_id con el programa:', error.message);
}

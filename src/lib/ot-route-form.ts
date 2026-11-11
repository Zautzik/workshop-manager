/**
 * La ruta de una OT que todavía se está creando.
 *
 * El asistente pregunta por qué etapas pasa la OT (no toda pasa por todas: una
 * digital no va a la guillotina antes, un papel que llega a medida tampoco) y
 * la pre-llena con lo que la ficha sugiere — la misma deducción que usaba el
 * planificador (`inferRoute`). Quien crea la OT la corrige; la que queda es la
 * que manda (`ots.route_steps`).
 */

import { declaredRoute, inferRoute, PLAN_STEP_KEYS, type PlanStepKey } from '@/lib/production-route';
import { paperEntryStatus } from '@/lib/paper-issue';
import type { UnifiedOTForm } from '@/types/ot-unified';

type RouteForm = Pick<
	UnifiedOTForm,
	'quantity' | 'product_type' | 'color_front' | 'color_back' | 'finishes' | 'calculations' | 'machine' | 'route_steps'
>;

/** Lo que sugiere la ficha. */
export function suggestedRoute(form: RouteForm): PlanStepKey[] {
	const machineId = form.machine?.machine_id ?? 'asignada';
	const digital = form.machine?.machine_type === 'impresion_digital';
	const steps = inferRoute(
		{
			id: 'nueva',
			status: 'visto_bueno',
			quantity: form.quantity,
			product_type: form.product_type || null,
			color_front: form.color_front,
			color_back: form.color_back,
			calc_sheets: form.calculations?.calc_sheets ?? null,
			calc_print_hours: form.calculations?.calc_print_hours ?? null,
			calc_finish_hours: form.calculations?.calc_finish_hours ?? null,
			assigned_machine_id: machineId,
			...form.finishes,
		},
		new Map([[machineId, digital ? 'digital_printer' : 'offset_printer']]),
	);
	return steps.map((s) => s.key);
}

/** La ruta que va a quedar: la elegida, o la sugerida si nadie la tocó. */
export function effectiveRoute(form: RouteForm): PlanStepKey[] {
	return declaredRoute({ route_steps: form.route_steps }) ?? suggestedRoute(form);
}

/** La etapa de la ruta donde el papel sale de bodega, o `null`. */
export function paperEntryStep(route: PlanStepKey[]): PlanStepKey | null {
	const status = paperEntryStatus(route.map((key) => ({ key })));
	if (!status) return null;
	return route.find((k) => paperEntryStatus([{ key: k }]) === status) ?? null;
}

export { PLAN_STEP_KEYS };

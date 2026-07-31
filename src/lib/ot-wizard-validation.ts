/**
 * Qué hace falta para avanzar cada paso del asistente de OT.
 *
 * EL AGUJERO QUE CIERRA. `canAdvance` validaba los pasos 1, 2 y 3 y después
 * hacía `default: return true`. Como la barra de pasos deja saltar a cualquier
 * paso mientras `canAdvance` sea verdadero, desde el paso 3 se podía ir directo
 * al Resumen salteando MÁQUINA. Y sin máquina elegida, `pressLimit` queda en
 * null: el motor vuelve a proponer un pliego 77×110 para una Ryobi que agarra
 * 37×52 — el error de 6,3× que se corrigió en la auditoría de julio, alcanzable
 * de nuevo por la puerta de al lado.
 *
 * Vive acá y no dentro del componente para poder testearlo: el resto de la
 * lógica de negocio de este proyecto (costeo, atribución, abastecimiento) ya
 * sigue esa forma.
 */

import type { UnifiedOTForm } from '@/types/ot-unified';

export interface StepCheck {
	ok: boolean;
	/** Por qué no se puede avanzar, en el idioma del vendedor. */
	reason: string | null;
}

const OK: StepCheck = { ok: true, reason: null };
const no = (reason: string): StepCheck => ({ ok: false, reason });

/** Índices de UNIFIED_STEPS, nombrados para que la validación se lea. */
export const STEP = {
	CATEGORY: 0,
	INFO: 1,
	SPECS: 2,
	PRODUCTION: 3,
	MACHINE: 4,
	MONTAJE: 5,
	OPERATIONS: 6,
	SUMMARY: 7,
} as const;

export function validateStep(step: number, form: UnifiedOTForm): StepCheck {
	switch (step) {
		case STEP.CATEGORY:
			return form.work_category
				? OK
				: no('Elige el tipo de trabajo para continuar.');

		case STEP.INFO: {
			if (!form.client_name?.trim()) return no('Falta el cliente.');
			if (!(form.quantity > 0)) return no('La cantidad tiene que ser mayor que cero.');
			return OK;
		}

		case STEP.SPECS: {
			if (!(form.width_cm > 0) || !(form.height_cm > 0)) {
				return no('Faltan las medidas de la pieza (ancho y alto).');
			}
			// El arte es evidencia: o hay adjunto, o alguien declara que no lo hay.
			// La regla ya existe al crear la OT; acá se avisa antes para no
			// llegar al final y rebotar.
			if ((form.attachments?.length ?? 0) === 0 && !form.sin_arte) {
				return no('Adjunta el arte o marca explícitamente que este trabajo va sin arte.');
			}
			return OK;
		}

		case STEP.PRODUCTION:
			// Sin requisitos duros: hay trabajos que se describen en una línea y
			// otros que necesitan tapas e interior. Forzar un mínimo acá sería
			// inventar una regla que el taller no tiene.
			return OK;

		case STEP.MACHINE: {
			// La razón de ser de este archivo.
			if (!form.machine?.machine_id) {
				return no(
					'Elige la máquina. De ella salen el área máxima de impresión, la velocidad y los cuerpos de color: sin eso el montaje y el costeo se calculan sobre una prensa que no existe.'
				);
			}
			return OK;
		}

		case STEP.MONTAJE: {
			if (!form.imposition) {
				return no('Todavía no hay imposición calculada. Revisa medidas, cantidad y máquina.');
			}
			if (form.imposition.exceeds_press) {
				return no(
					'La pieza no entra en ningún pliego que esta máquina pueda tomar. Cambia de máquina o parte el trabajo.'
				);
			}
			if (!(form.imposition.poses_per_sheet > 0)) {
				return no('La imposición dio cero poses por pliego: revisa las medidas.');
			}
			return OK;
		}

		case STEP.OPERATIONS: {
			if (!form.operations || form.operations.length === 0) {
				return no('No hay operaciones que costear. Vuelve a Máquina o agrega una operación.');
			}
			if (!(form.pricing?.total_price > 0)) {
				return no('El precio total es cero: revisa las operaciones y el margen.');
			}
			return OK;
		}

		default:
			return OK;
	}
}

/**
 * A qué paso se puede saltar desde la barra superior.
 *
 * Volver a cualquier paso ya visitado siempre se permite. Hacia adelante, sólo
 * el siguiente y sólo si el actual está completo — antes se permitía saltar a
 * CUALQUIER paso posterior, que es lo que dejaba llegar al Resumen sin máquina.
 */
export function canJumpToStep(target: number, current: number, currentOk: boolean): boolean {
	if (target <= current) return true;
	return target === current + 1 && currentOk;
}

/**
 * Antes de crear la OT: todos los pasos, no sólo el último. Si alguien llegó
 * al final por un camino que no previmos, acá se frena igual.
 */
export function validateAllSteps(form: UnifiedOTForm): StepCheck {
	for (const step of [
		STEP.CATEGORY, STEP.INFO, STEP.SPECS, STEP.PRODUCTION,
		STEP.MACHINE, STEP.MONTAJE, STEP.OPERATIONS,
	]) {
		const check = validateStep(step, form);
		if (!check.ok) return check;
	}
	return OK;
}

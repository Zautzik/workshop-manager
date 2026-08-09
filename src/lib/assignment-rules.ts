/**
 * Cuándo un turno tiene que decir a qué trabajo se cargó.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 *
 * `worker_assignments.ot_id` es opcional en la base y era opcional en la
 * pantalla. Una asignación sin OT es una persona que trabajó ocho horas para
 * nadie: esas horas no entran al costo de ningún trabajo, y el margen de la OT
 * que sí atendió sale más alto de lo que fue. No es un dato faltante, es un
 * dato que miente en la dirección agradable.
 *
 * Con la base sembrada, las 1.700 asignaciones llevan OT. La pregunta es qué
 * pasa el segundo mes de uso real, cuando un supervisor apurado asigna sin
 * elegir trabajo. Sin esta regla, el costeo se degrada solo y en silencio.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 *
 * **Si la máquina produce, el turno nombra la OT.** Prensa, guillotina,
 * troqueladora, dobladora, alzadora, corchetera, hotmelera, polilaminadora,
 * digital, CTP y taller manual: todas trabajan sobre un pedido concreto y ese
 * pedido tiene que pagarlas.
 *
 * La excepción es el **reparto**. Un camión sale con la carga de varias OT y
 * obligarlo a elegir una sería inventar una atribución: el costo de despacho no
 * es de un trabajo, es del día. Se deja sin OT a propósito, no por descuido.
 *
 * Se decidió por TIPO DE MÁQUINA y no por nombre de rol porque el rol es texto
 * libre —conviven «operator», «overtime_operator_50» y «Operador de prensa»— y
 * una regla sobre texto libre se rompe la primera vez que alguien escribe
 * distinto. El tipo de máquina es un enum de la base.
 */

/** Los tipos de `machines.type`, tal como los declara el enum `machine_type`. */
export type MachineType =
	| 'offset_printer' | 'die_cutter' | 'guillotine' | 'digital_printer'
	| 'pre_press' | 'manual_workshop' | 'delivery' | 'folder'
	| 'collator' | 'stitcher' | 'perfect_binder' | 'laminator';

/**
 * Máquinas cuyo trabajo NO se atribuye a una OT.
 *
 * Lista corta y explícita a propósito: si mañana entra un tipo nuevo al enum,
 * cae del lado que exige OT. Es el lado seguro — pedir el dato de más es un
 * roce; perderlo es un margen equivocado que nadie va a notar.
 */
const SIN_ATRIBUCION: readonly MachineType[] = ['delivery'];

export interface AssignmentCheck {
	ok: boolean;
	/** Qué decirle al supervisor. `null` cuando está bien. */
	reason: string | null;
	/** Si la pantalla debe exigir el campo antes de dejar guardar. */
	otRequired: boolean;
}

/**
 * ¿Se puede guardar este turno?
 *
 * `machineType` desconocido (la máquina no se pudo resolver) NO exime: se
 * exige igual. Un turno que no se sabe dónde ocurrió es el caso que más vale la
 * pena frenar.
 */
export function checkAssignment(input: {
	machineType: MachineType | string | null | undefined;
	otId: string | null | undefined;
}): AssignmentCheck {
	const exenta = SIN_ATRIBUCION.includes(input.machineType as MachineType);

	if (exenta) {
		return { ok: true, reason: null, otRequired: false };
	}

	if (!input.otId) {
		return {
			ok: false,
			otRequired: true,
			reason:
				'Falta la OT: un turno en una máquina de producción tiene que decir a qué trabajo se carga. ' +
				'Sin eso, esas horas no entran al costo de ninguna orden y el margen sale más alto de lo que fue.',
		};
	}

	return { ok: true, reason: null, otRequired: true };
}

/** ¿Esta máquina obliga a elegir OT? Para que la pantalla marque el campo. */
export function requiresOT(machineType: MachineType | string | null | undefined): boolean {
	return !SIN_ATRIBUCION.includes(machineType as MachineType);
}

/**
 * Cuánto se degradó la atribución.
 *
 * Se usa para poder decirlo en pantalla en vez de dejar que se pudra en
 * silencio: «12 de 340 turnos de este mes no dicen a qué trabajo se cargaron».
 */
export function attributionHealth(
	rows: readonly { machineType?: string | null; otId?: string | null }[],
): { total: number; exigibles: number; sinOt: number; rate: number | null; note: string | null } {
	const exigibles = rows.filter((r) => requiresOT(r.machineType));
	const sinOt = exigibles.filter((r) => !r.otId).length;

	if (exigibles.length === 0) {
		return { total: rows.length, exigibles: 0, sinOt: 0, rate: null, note: null };
	}

	const rate = sinOt / exigibles.length;
	return {
		total: rows.length,
		exigibles: exigibles.length,
		sinOt,
		rate,
		note:
			sinOt === 0
				? null
				: `${sinOt} de ${exigibles.length} turnos en máquinas de producción no dicen a qué OT se cargaron. ` +
					`Esas horas no están en el costo de ningún trabajo.`,
	};
}

/**
 * Qué deshace un retroceso en el libro de costos.
 *
 * ── El hueco ────────────────────────────────────────────────────────────────
 *
 * Retroceder una OT cambiaba la columna y nada más. Las pasadas de las etapas
 * que la OT «des-hizo» seguían en `ot_stage_reports`, y de ellas salen el
 * tiempo de máquina y la mano de obra (`stage-valuation.ts`); el papel que
 * salió al entrar a una etapa seguía fuera de bodega y cargado a la OT. Cuando
 * la OT volvía a avanzar, `moveOT` escribía una pasada NUEVA por la misma
 * etapa: las horas quedaban dos veces en el costo, y una pasada abierta de la
 * primera vuelta seguía frenando el despacho por una etapa que ya se había
 * vuelto a cerrar.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 *
 * Una pasada es el registro de haber DEJADO una etapa. Una OT que vuelve a `T`
 * no dejó `T` ni nada de lo que viene después: todas las pasadas de `T` en
 * adelante dejan de valer. Con ellas se van sus líneas de máquina y de mano de
 * obra, porque la valorización es una función de las pasadas que existen.
 *
 * El material sale al ENTRAR a una etapa. Una OT que vuelve a `T` sigue dentro
 * de `T`: lo que salió para entrar a `T` se queda, y lo que salió para entrar
 * a una etapa posterior vuelve a bodega con un movimiento de devolución —nunca
 * borrando la salida—, que es lo que acredita el costo a la OT.
 *
 * Lo que NO se toca: los costos cargados a mano (las correcciones del libro,
 * `ref_type = 'correccion'` en cost-correction.ts: tercerizados, despachos,
 * extras) y las horas de práctica de la matriz de
 * competencias, que salen de `worker_assignments` — la persona estuvo en la
 * máquina, haya terminado como haya terminado la OT.
 *
 * Módulo puro: decide QUÉ se revierte. Las lecturas y escrituras viven en
 * `rollback-reversal-server.ts`.
 */

import { OTStatusSchema, isValidStatus, type OTWorkflowStatus } from '@/lib/ot-state-machine';

const ORDER: readonly OTWorkflowStatus[] = OTStatusSchema.options;
const indexOf = (status: string): number => (isValidStatus(status) ? ORDER.indexOf(status) : -1);

/** Los centavos de kg que deja el redondeo de pliegos a la unidad del lote. */
const EPS = 0.0005;

export interface PassRef {
	id: string;
	workflow_step: string;
	created_at?: string | null;
}

/** ¿Esto se escribió después de `since`? Sin `since` (o sin fecha), sí. */
const after = (createdAt: string | null | undefined, since: string | null | undefined): boolean =>
	!since || !createdAt || Date.parse(createdAt) > Date.parse(since);

/**
 * Desde cuándo cuenta lo que un retroceso a `toStatus` deshace: la última vez
 * que la OT LLEGÓ a esa etapa.
 *
 * Un movimiento equivocado deshace lo que se escribió desde entonces, no la
 * historia entera. Una OT que ya pasó por offset, volvió por un reproceso (esas
 * horas se gastaron y se quedan) y después alguien la adelantó de más, tiene
 * dos pasadas por offset: sólo la segunda es del error.
 *
 * `null` = nunca llegó por un movimiento registrado (nació ahí): todo cuenta.
 */
export function arrivedAt(
	history: readonly { to_status: string; created_at: string }[],
	toStatus: OTWorkflowStatus,
): string | null {
	const arrivals = history.filter((h) => h.to_status === toStatus).map((h) => h.created_at);
	return arrivals.length ? arrivals.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
}

/**
 * Las pasadas que un retroceso a `toStatus` deja sin valor: las de esa etapa y
 * las de todas las posteriores, escritas desde que la OT llegó ahí (`since`).
 */
export function passesUndoneBy<T extends PassRef>(
	passes: readonly T[],
	toStatus: OTWorkflowStatus,
	since?: string | null,
): T[] {
	const target = indexOf(toStatus);
	return passes.filter((p) => {
		const i = indexOf(p.workflow_step);
		return i >= 0 && i >= target && after(p.created_at, since);
	});
}

export interface BirthPassCandidate extends PassRef {
	units_moved: number | null;
	created_at: string;
}

/**
 * La pasada con la que nació un fragmento.
 *
 * Un avance parcial escribe la pasada contra el PADRE —es el que estuvo en la
 * máquina— con las unidades que se llevó el fragmento. Si ese fragmento vuelve
 * a la etapa de la que salió, esa pasada es la que hay que deshacer, y no está
 * entre las suyas. Se reconoce por las tres cosas que la identifican: la etapa
 * que dejó, las unidades y el momento. Si no calza exactamente una, no se
 * adivina: se avisa.
 */
export function birthPassOf<T extends BirthPassCandidate>(
	parentPasses: readonly T[],
	birth: { fromStatus: string; units: number; at: string },
	toleranceMs = 120_000,
): T | null {
	const at = Date.parse(birth.at);
	const matches = parentPasses.filter(
		(p) =>
			p.workflow_step === birth.fromStatus &&
			Number(p.units_moved) === Math.round(birth.units) &&
			Math.abs(Date.parse(p.created_at) - at) <= toleranceMs,
	);
	return matches.length === 1 ? matches[0] : null;
}

export interface StockTx {
	id: string;
	tx_type: string;
	lot_id: string | null;
	item_id: string;
	quantity: number;
	unit_cost: number | null;
	reference_code: string | null;
	/** En una salida, la etapa a la que se entraba (`consumir_lote` la guarda acá). */
	notes: string | null;
	created_at: string;
}

export interface ConsumptionReversal<T extends StockTx> {
	/** Salidas que hay que devolver a bodega. */
	toReturn: T[];
	/**
	 * Salidas posteriores a `toStatus` que NO se devuelven solas, porque el lote
	 * ya tiene devoluciones que no calzan con ninguna salida entera: alguien
	 * devolvió una parte a mano y no se puede saber de cuál.
	 */
	ambiguous: T[];
}

/**
 * Las salidas de material que un retroceso a `toStatus` tiene que devolver.
 *
 * Sólo las que dicen a qué etapa entraban y esa etapa es POSTERIOR a
 * `toStatus`. Una salida sin etapa reconocible (un escaneo suelto) no se toca:
 * no hay cómo saber si la OT ya la usó.
 *
 * Y nunca dos veces: una devolución no apunta a la salida que deshace, así que
 * se emparejan por lote y cantidad —una devolución siempre repite la cantidad
 * exacta de su salida— y lo ya devuelto queda fuera.
 */
export function consumptionsUndoneBy<T extends StockTx>(
	txs: readonly T[],
	toStatus: OTWorkflowStatus,
	since?: string | null,
): ConsumptionReversal<T> {
	const target = indexOf(toStatus);
	const byLot = new Map<string, T[]>();
	for (const tx of txs) {
		const key = tx.lot_id ?? `item:${tx.item_id}`;
		byLot.set(key, [...(byLot.get(key) ?? []), tx]);
	}

	const toReturn: T[] = [];
	const ambiguous: T[] = [];

	for (const lotTxs of byLot.values()) {
		// Las más nuevas primero: una devolución deshace la última salida que
		// calce, que es la que quedó sin usar.
		const open = lotTxs
			.filter((t) => t.tx_type === 'consumption')
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
		let unmatched = 0;
		for (const ret of lotTxs.filter((t) => t.tx_type === 'return_to_stock')) {
			const i = open.findIndex((c) => Math.abs(Number(c.quantity) - Number(ret.quantity)) <= EPS);
			if (i >= 0) open.splice(i, 1);
			else unmatched += Number(ret.quantity);
		}

		const undone = open.filter((c) => {
			const stage = indexOf(c.notes ?? '');
			return stage >= 0 && stage > target && after(c.created_at, since);
		});
		if (undone.length === 0) continue;
		(unmatched > EPS ? ambiguous : toReturn).push(...undone);
	}

	return { toReturn, ambiguous };
}

export interface GroupMemberStatus {
	id: string;
	status: string;
}

/**
 * ¿Algún otro fragmento del grupo sigue usando el material que salió para
 * entrar a `stage`?
 *
 * El papel de un trabajo partido sale contra la dueña y lo comparten todos los
 * fragmentos. Devolverlo porque UNO retrocedió dejaría sin papel, en el libro,
 * a los que siguen en máquina.
 */
export function stageStillInUse(group: readonly GroupMemberStatus[], movingOtId: string, stage: string): boolean {
	const s = indexOf(stage);
	return group.some((g) => g.id !== movingOtId && indexOf(g.status) >= s);
}

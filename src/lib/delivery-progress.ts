/**
 * Cuánto de una OT se despachó al cliente y cuánto sigue en planta.
 *
 * Una orden de 150.000 etiquetas rara vez sale en un solo viaje: se despacha
 * por guías parciales. La vista `ot_fulfillment` ya suma `dispatched_qty` sobre
 * `dispatch_guides` y cuenta las guías, así que aquí no se recalcula nada — sólo
 * se traduce a las tres cifras que el jefe de taller mira en la tabla: cuánto
 * pidió el cliente, cuánto se le entregó, y cuánto queda por entregar.
 *
 * "En proceso" es deliberadamente lo NO despachado, no lo producido: no existe
 * en el modelo una cantidad producida distinta de la despachada, y fabricar una
 * estimación sería inventar un número con cara de dato.
 */

export interface FulfillmentLike {
	ordered_qty: number | null | undefined;
	dispatched_qty: number | null | undefined;
	guide_count: number | null | undefined;
}

export type DeliveryStage =
	/** No hay fila de fulfillment, o la orden no tiene cantidad. */
	| 'sin_datos'
	/** Nada ha salido todavía. */
	| 'en_proceso'
	/** Salió parte; el resto sigue en planta. */
	| 'parcial'
	/** Se entregó todo lo pedido. */
	| 'completo'
	/** Se despachó más de lo pedido — merece revisión, no se esconde. */
	| 'excedido';

export interface DeliveryProgress {
	ordered: number;
	delivered: number;
	/** Lo pedido que aún no sale de planta. Nunca negativo. */
	inProcess: number;
	/** 0–100, redondeado. Se recorta a 100 aunque haya exceso. */
	pct: number;
	guides: number;
	stage: DeliveryStage;
}

const EMPTY: DeliveryProgress = {
	ordered: 0,
	delivered: 0,
	inProcess: 0,
	pct: 0,
	guides: 0,
	stage: 'sin_datos',
};

function toNumber(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function deliveryProgress(row: FulfillmentLike | null | undefined): DeliveryProgress {
	if (!row) return EMPTY;

	const ordered = Math.max(0, toNumber(row.ordered_qty));
	// Una cantidad despachada negativa no significa nada; se trata como cero.
	const delivered = Math.max(0, toNumber(row.dispatched_qty));
	const guides = Math.max(0, toNumber(row.guide_count));

	// Sin cantidad pedida no hay porcentaje que calcular: dividir daría Infinity
	// o NaN y la celda mostraría basura.
	if (ordered === 0) return { ...EMPTY, delivered, guides };

	const inProcess = Math.max(0, ordered - delivered);
	const pct = Math.min(100, Math.round((delivered / ordered) * 100));

	let stage: DeliveryStage;
	if (delivered === 0) stage = 'en_proceso';
	else if (delivered > ordered) stage = 'excedido';
	else if (delivered < ordered) stage = 'parcial';
	else stage = 'completo';

	return { ordered, delivered, inProcess, pct, guides, stage };
}

export const DELIVERY_STAGE_LABEL: Record<DeliveryStage, string> = {
	sin_datos: 'Sin datos',
	en_proceso: 'En proceso',
	parcial: 'Entrega parcial',
	completo: 'Entregado',
	excedido: 'Excede lo pedido',
};

/** Índice por `ot_id` para que la tabla no haga un find() por fila. */
export function indexByOt<T extends { ot_id: string }>(rows: readonly T[]): Map<string, T> {
	return new Map(rows.map((r) => [r.ot_id, r]));
}

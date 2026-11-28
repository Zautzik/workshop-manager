/**
 * Cancelar una OT: qué papel puede volver a bodega, y cuánto.
 *
 * Cancelar no es retroceder. Un retroceso deja la OT viva en un proceso
 * anterior; una cancelación la saca del flujo. Y lo que pasa con el costo es
 * distinto: las horas que ya se trabajaron se gastaron y se quedan, pero el
 * papel que salió de bodega y nadie tocó vuelve a estar disponible para otro
 * trabajo.
 *
 * Cuánto vuelve no lo puede saber la base: de los 2.000 pliegos que salieron,
 * quizá 600 ya pasaron por la guillotina. Lo dice quien cancela, lote por
 * lote, mirando el papel. Lo que no vuelve queda como costo real de la OT —es
 * lo que la cancelación costó de verdad.
 *
 * Módulo puro. `ot-cancel-server.ts` trae los datos y escribe.
 */

import type { OTWorkflowStatus } from '@/lib/ot-state-machine';
import { perSheet, quantityToSheets, sheetsToQuantity, type PaperItem } from '@/lib/paper-issue';

/**
 * Una OT que ya salió por la puerta no se cancela: lo que hay que deshacer ahí
 * es una entrega (guía, factura), no una orden de trabajo.
 */
const NO_CANCELABLE: readonly OTWorkflowStatus[] = ['in_delivery', 'completed'];

/** `null` si se puede cancelar; si no, por qué no. */
export function whyNotCancelable(ot: { status: string; cancelled_at?: string | null }): string | null {
	if (ot.cancelled_at) return 'La OT ya está cancelada.';
	if ((NO_CANCELABLE as readonly string[]).includes(ot.status)) {
		return 'La OT ya salió a entrega: no se cancela desde acá. Lo que corresponde es anular la guía o la factura.';
	}
	return null;
}

export interface IssueTx {
	tx_type: string;
	lot_id: string | null;
	item_id: string;
	work_order_id: string;
	quantity: number;
	unit_cost: number | null;
	/** `consumir_lote` guarda acá el número de lote. */
	reference_code: string | null;
	item: (PaperItem & { name?: string | null }) | null;
}

export interface IssuedLot {
	lotId: string;
	lotNumber: string | null;
	itemId: string;
	itemName: string;
	unit: string;
	/** La OT contra la que salió: la misma, o la dueña si es un fragmento. */
	workOrderId: string;
	/** Lo que sigue afuera, en la unidad del lote (salidas menos devoluciones). */
	netQuantity: number;
	/** Lo mismo en pliegos. `null` si el ítem no se puede convertir. */
	netSheets: number | null;
	/** Unidad del lote por pliego. */
	perSheet: number | null;
	/** Costo unitario promedio de lo que salió, para acreditar la devolución. */
	unitCost: number;
}

const EPS = 0.0005;

/**
 * Lo que la OT tiene afuera de cada lote, neto de lo que ya volvió.
 *
 * Un lote por OT de cargo: el papel de un trabajo partido sale contra la dueña
 * y un escaneo suelto contra el fragmento, y la devolución tiene que acreditar
 * a quien se le cargó.
 */
export function issuedByLot(
	txs: readonly IssueTx[],
	otFallback?: { calcKg?: number | null; calcSheets?: number | null },
): IssuedLot[] {
	const acc = new Map<string, { first: IssueTx; out: number; back: number; cost: number }>();
	for (const tx of txs) {
		if (!tx.lot_id || (tx.tx_type !== 'consumption' && tx.tx_type !== 'return_to_stock')) continue;
		const key = `${tx.work_order_id}|${tx.lot_id}`;
		const a = acc.get(key) ?? { first: tx, out: 0, back: 0, cost: 0 };
		const q = Number(tx.quantity ?? 0);
		if (tx.tx_type === 'consumption') {
			a.out += q;
			a.cost += q * Number(tx.unit_cost ?? 0);
		} else {
			a.back += q;
		}
		acc.set(key, a);
	}

	const lots: IssuedLot[] = [];
	for (const a of acc.values()) {
		const net = Math.round((a.out - a.back) * 1000) / 1000;
		if (!(net > EPS)) continue;
		const f = a.first.item ? perSheet(a.first.item, otFallback) : null;
		lots.push({
			lotId: a.first.lot_id as string,
			lotNumber: a.first.reference_code,
			itemId: a.first.item_id,
			itemName: a.first.item?.name ?? 'Material',
			unit: a.first.item?.unit ?? 'unidades',
			workOrderId: a.first.work_order_id,
			netQuantity: net,
			netSheets: f ? quantityToSheets(net, f) : null,
			perSheet: f,
			unitCost: a.out > 0 ? a.cost / a.out : 0,
		});
	}
	return lots;
}

export interface ReturnRequest {
	lotId: string;
	sheets: number;
}

export interface PlannedReturn {
	lot: IssuedLot;
	sheets: number;
	/** En la unidad del lote. */
	quantity: number;
	/** Lo que se le acredita a la OT, CLP. */
	amount: number;
}

/**
 * De lo que pidió quien cancela a los movimientos de devolución.
 *
 * Tira un error que se puede mostrar tal cual si piden devolver más de lo que
 * hay afuera o de un lote del que la OT no sacó nada: devolver de más
 * inventaría papel que no existe.
 */
export function planReturns(issued: readonly IssuedLot[], requested: readonly ReturnRequest[]): PlannedReturn[] {
	const out: PlannedReturn[] = [];
	const seen = new Set<string>();
	for (const r of requested) {
		const sheets = Math.round(Number(r.sheets));
		if (!(sheets > 0)) continue;
		if (seen.has(r.lotId)) throw new Error('Un mismo lote aparece dos veces en la devolución.');
		seen.add(r.lotId);

		const lot = issued.find((l) => l.lotId === r.lotId);
		if (!lot) throw new Error('Uno de los lotes a devolver no tiene papel afuera para esta OT.');
		if (lot.perSheet == null || lot.netSheets == null) {
			throw new Error(`El lote ${lot.lotNumber ?? ''} está en ${lot.unit} y no se puede pasar a pliegos. Devolvelo desde Bodega.`);
		}
		if (sheets > lot.netSheets) {
			throw new Error(
				`Del lote ${lot.lotNumber ?? ''} salieron ${lot.netSheets.toLocaleString('es-CL')} pliegos para esta OT: no pueden volver ${sheets.toLocaleString('es-CL')}.`,
			);
		}
		// Todos los pliegos = todo lo que salió, sin dejar un resto de redondeo
		// de kg flotando en el costo de la OT.
		const quantity = sheets === lot.netSheets ? lot.netQuantity : Math.min(lot.netQuantity, sheetsToQuantity(sheets, lot.perSheet));
		out.push({ lot, sheets, quantity, amount: Math.round(quantity * lot.unitCost) });
	}
	return out;
}

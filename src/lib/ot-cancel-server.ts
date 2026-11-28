/**
 * Cancelar una OT, escrito en la base.
 *
 * Las reglas —qué se puede cancelar, cuánto papel puede volver— viven en
 * `ot-cancel.ts` (puro). Esto trae los datos y escribe, en este orden:
 *
 *   1. la marca      — `cancelled_at` con guardia: si otro la canceló o la movió
 *                      a entrega entre la lectura y esto, cero filas y un 409;
 *   2. el papel      — una devolución por lote, por lo que dijo quien cancela.
 *                      Si falla, la marca se deshace: una OT cancelada con el
 *                      papel todavía cargado es peor que una sin cancelar;
 *   3. las reservas  — lo apartado para la OT queda libre para otro trabajo;
 *   4. el historial  — con el motivo y lo devuelto, lote por lote.
 *
 * Lo que NO se toca: las pasadas, el tiempo de máquina, la mano de obra y los
 * costos cargados a mano. Ese trabajo se hizo; cancelar no lo des-hace, y es
 * justamente lo que hay que poder leer después: cuánto costó la cancelación.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Json } from '@/integrations/supabase/types';
import { issuedByLot, planReturns, whyNotCancelable, type IssueTx, type IssuedLot, type ReturnRequest } from '@/lib/ot-cancel';
import { splitOwner, type SplitMember } from '@/lib/ot-split-lineage';
import { ITEM_FIELDS, isPaper } from '@/lib/paper-issue-server';
import { isValidStatus } from '@/lib/ot-state-machine';

type Row = Record<string, any>;

const OT_FIELDS = 'id, ot_number, status, quantity, split_group_id, calc_sheets, calc_substrate_kg, cancelled_at, cancel_reason';

/** La columna no existe hasta aplicar 20261128120000_la_ot_se_puede_cancelar.sql. */
const MIGRATION_MISSING = 'Falta aplicar la migración que permite cancelar OTs (20261128120000_la_ot_se_puede_cancelar.sql).';
const isMissingColumn = (error: { code?: string; message?: string } | null) =>
	error?.code === '42703' || /cancelled_at|cancel_reason/.test(error?.message ?? '');

export type CancelFailure = { ok: false; status: number; error: string };

export interface CancelPreview {
	ok: true;
	ot: { id: string; ot_number: string; status: string; cancelled_at: string | null };
	/** `null` si se puede cancelar. */
	blocked: string | null;
	/** Papel afuera, lote por lote. */
	lots: Array<Pick<IssuedLot, 'lotId' | 'lotNumber' | 'itemName' | 'unit' | 'netQuantity' | 'netSheets'>>;
	/** Otros fragmentos del trabajo que siguen vigentes: comparten ese papel. */
	siblings: string[];
}

async function load(otId: string): Promise<{ ot: Row; issued: IssuedLot[]; siblings: string[] } | CancelFailure> {
	const { data, error } = await supabaseAdmin.from('ots').select(OT_FIELDS).eq('id', otId).maybeSingle();
	if (error) return { ok: false, status: isMissingColumn(error) ? 503 : 500, error: isMissingColumn(error) ? MIGRATION_MISSING : 'No se pudo leer la OT.' };
	if (!data) return { ok: false, status: 404, error: 'OT no encontrada' };
	const ot = data as unknown as Row;

	// El papel de un trabajo partido sale contra la dueña.
	let group: Row[] = [];
	if (ot.split_group_id) {
		const { data: g, error: gErr } = await supabaseAdmin.from('ots').select(OT_FIELDS).eq('split_group_id', ot.split_group_id);
		if (gErr) return { ok: false, status: 500, error: 'No se pudo leer el grupo de la OT partida.' };
		group = (g ?? []) as unknown as Row[];
	}
	const owner = splitOwner(ot as SplitMember & Row, group as (SplitMember & Row)[]);
	const otIds = [...new Set([ot.id as string, owner.id as string])];

	const { data: txs, error: txErr } = await supabaseAdmin
		.from('inventory_stock_transactions')
		.select(`tx_type, lot_id, item_id, work_order_id, quantity, unit_cost, reference_code, inventory_items(${ITEM_FIELDS})`)
		.in('work_order_id', otIds)
		.in('tx_type', ['consumption', 'return_to_stock']);
	if (txErr) return { ok: false, status: 500, error: `No se pudo leer el papel que salió para la OT: ${txErr.message}` };

	const paper = ((txs ?? []) as Row[])
		.filter((t) => isPaper(t.inventory_items as Row | null))
		.map((t): IssueTx => ({
			tx_type: t.tx_type, lot_id: t.lot_id, item_id: t.item_id, work_order_id: t.work_order_id,
			quantity: Number(t.quantity ?? 0), unit_cost: t.unit_cost, reference_code: t.reference_code,
			item: t.inventory_items as IssueTx['item'],
		}));

	return {
		ot,
		issued: issuedByLot(paper, { calcKg: owner.calc_substrate_kg, calcSheets: owner.calc_sheets }),
		siblings: group.filter((g) => g.id !== ot.id && !g.cancelled_at).map((g) => String(g.ot_number)),
	};
}

/** Lo que el diálogo necesita para preguntar: ¿se puede?, ¿qué papel hay afuera? */
export async function cancelPreview(otId: string): Promise<CancelPreview | CancelFailure> {
	const loaded = await load(otId);
	if ('ok' in loaded) return loaded;
	const { ot, issued, siblings } = loaded;
	return {
		ok: true,
		ot: { id: ot.id, ot_number: ot.ot_number, status: ot.status, cancelled_at: ot.cancelled_at ?? null },
		blocked: whyNotCancelable(ot as { status: string; cancelled_at?: string | null }),
		lots: issued.map((l) => ({
			lotId: l.lotId, lotNumber: l.lotNumber, itemName: l.itemName, unit: l.unit, netQuantity: l.netQuantity, netSheets: l.netSheets,
		})),
		siblings,
	};
}

export interface CancelResult {
	ok: true;
	ot: { id: string; ot_number: string; status: string; cancelled_at: string };
	returned: Array<{ lot: string | null; item: string; sheets: number; quantity: number; unit: string; amount: number }>;
	/** Lo acreditado a la OT por el papel devuelto, CLP. */
	materialReturned: number;
	/** Pliegos que salieron y no vuelven: quedan como costo de la OT. */
	sheetsKept: number;
	reservationsReleased: number;
	warnings: string[];
}

export async function cancelOT(input: {
	otId: string;
	reason: string;
	returns: ReturnRequest[];
	actor: { id: string | null; role: string };
}): Promise<CancelResult | CancelFailure> {
	const reason = input.reason.trim();
	if (reason.length < 5) return { ok: false, status: 400, error: 'Decí por qué se cancela la OT.' };

	const loaded = await load(input.otId);
	if ('ok' in loaded) return loaded;
	const { ot, issued } = loaded;

	const blocked = whyNotCancelable(ot as { status: string; cancelled_at?: string | null });
	if (blocked) return { ok: false, status: 409, error: blocked };

	// Antes de escribir nada: lo pedido tiene que caber en lo que hay afuera.
	let planned;
	try {
		planned = planReturns(issued, input.returns);
	} catch (err) {
		return { ok: false, status: 400, error: err instanceof Error ? err.message : 'La devolución de papel no es válida.' };
	}

	// ── 1. La marca ───────────────────────────────────────────────────────
	const nowIso = new Date().toISOString();
	const { data: marked, error: markError } = await supabaseAdmin
		.from('ots')
		.update({ cancelled_at: nowIso, cancel_reason: reason, cancelled_by: input.actor.id, updated_at: nowIso } as never)
		.eq('id', input.otId)
		.eq('status', ot.status)
		.is('cancelled_at' as never, null)
		.select('id')
		.maybeSingle();
	if (markError) return { ok: false, status: 500, error: 'No se pudo cancelar la OT.' };
	if (!marked) return { ok: false, status: 409, error: 'La OT fue modificada por otra operación. Volvé a intentarlo.' };

	// ── 2. El papel ───────────────────────────────────────────────────────
	if (planned.length > 0) {
		const { error: returnError } = await supabaseAdmin.from('inventory_stock_transactions').insert(
			planned.map((p) => ({
				item_id: p.lot.itemId,
				lot_id: p.lot.lotId,
				tx_type: 'return_to_stock' as const,
				quantity: p.quantity,
				unit_cost: p.lot.unitCost,
				work_order_id: p.lot.workOrderId,
				reference_code: p.lot.lotNumber,
				notes: `OT ${ot.ot_number} cancelada: ${p.sheets.toLocaleString('es-CL')} pliegos vuelven a bodega`,
				created_by: input.actor.id,
			})),
		);
		if (returnError) {
			const { error: undoError } = await supabaseAdmin
				.from('ots')
				.update({ cancelled_at: null, cancel_reason: null, cancelled_by: null } as never)
				.eq('id', input.otId);
			return {
				ok: false,
				status: 500,
				error: undoError
					? `El papel no se pudo devolver (${returnError.message}) y la OT quedó marcada como cancelada. Avisá para que se corrija.`
					: `El papel no se pudo devolver a bodega (${returnError.message}). La OT no se canceló.`,
			};
		}
	}

	// ── 3. Las reservas ───────────────────────────────────────────────────
	const warnings: string[] = [];
	let reservationsReleased = 0;
	const { data: released, error: releaseError } = await supabaseAdmin.rpc('liberar_reserva' as never, {
		p_ot_id: input.otId,
		p_lot_id: null,
		p_motivo: `OT ${ot.ot_number} cancelada: ${reason}`,
	} as never);
	if (releaseError) warnings.push('La OT se canceló, pero sus reservas de papel no se pudieron liberar. Liberalas desde Bodega.');
	else reservationsReleased = Number(released ?? 0);

	// ── 4. El historial ───────────────────────────────────────────────────
	const returned = planned.map((p) => ({
		lot: p.lot.lotNumber, item: p.lot.itemName, sheets: p.sheets, quantity: p.quantity, unit: p.lot.unit, amount: p.amount,
	}));
	const sheetsKept = issued.reduce((s, l) => s + (l.netSheets ?? 0), 0) - planned.reduce((s, p) => s + p.sheets, 0);
	if (isValidStatus(ot.status)) {
		const { error: historyError } = await supabaseAdmin.from('ot_status_history').insert({
			ot_id: input.otId,
			from_status: ot.status,
			to_status: ot.status,
			changed_by: input.actor.id,
			changed_by_role: input.actor.role,
			reason: `Cancelada: ${reason}`.slice(0, 500),
			rollback: false,
			metadata: { cancelled: true, returned, sheets_kept: sheetsKept, reservations_released: reservationsReleased } as unknown as Json,
		});
		if (historyError) console.error('Error writing OT cancellation history:', historyError);
	}

	return {
		ok: true,
		ot: { id: ot.id, ot_number: ot.ot_number, status: ot.status, cancelled_at: nowIso },
		returned,
		materialReturned: returned.reduce((s, r) => s + r.amount, 0),
		sheetsKept,
		reservationsReleased,
		warnings,
	};
}

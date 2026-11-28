/**
 * El reverso de un retroceso, escrito en la base.
 *
 * Qué se revierte lo decide `rollback-reversal.ts` (puro, con las reglas y su
 * porqué). Esto trae los datos y escribe, DESPUÉS de que la OT cambió de
 * columna: si el retroceso no entró, no hay nada que deshacer.
 *
 * Cada paso falla solo y devuelve un aviso: la OT ya retrocedió, y un reverso a
 * medias con un aviso explícito es mejor que un 500 que deja a quien retrocede
 * sin saber qué quedó escrito.
 *
 * Qué se revierte lo dice quien retrocede, porque un retroceso es dos cosas
 * distintas y la base no puede distinguirlas: un reproceso (hubo un error en
 * producción y la OT vuelve a un proceso anterior: el trabajo se hizo, los
 * costos se incurrieron y se quedan) o un movimiento equivocado (la tarjeta se
 * movió de más y las etapas nunca se trabajaron: sus horas salen del costo).
 *
 * Nada se pierde: las pasadas que dejan de valer se devuelven enteras en
 * `summary.passes` y `moveOT` las guarda en el historial del retroceso; el
 * material vuelve con un movimiento de devolución, a la vista en el kardex.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Json } from '@/integrations/supabase/types';
import type { OTWorkflowStatus } from '@/lib/ot-state-machine';
import { splitOwner, type SplitMember } from '@/lib/ot-split-lineage';
import {
	arrivedAt,
	birthPassOf,
	consumptionsUndoneBy,
	passesUndoneBy,
	stageStillInUse,
	type BirthPassCandidate,
	type StockTx,
} from '@/lib/rollback-reversal';
import { STAGE_PASS_REF, valueStagePasses } from '@/lib/stage-valuation';
import { otStatusLabel } from '@/lib/status-labels';

type Row = Record<string, any>;
interface HistoryRow {
	from_status: string | null;
	to_status: string;
	created_at: string;
	rollback: boolean;
	metadata: Json;
}

export interface RollbackReversalSummary {
	/** Las pasadas que dejaron de valer, enteras: es el único lugar donde quedan. */
	passes: Row[];
	/** Tiempo de máquina que salió del costo real, CLP. */
	machineReversed: number;
	/** Mano de obra que salió del costo real, CLP. */
	laborReversed: number;
	/** Salidas de material devueltas a bodega. */
	returned: Array<{ tx_id: string; lot: string | null; quantity: number; amount: number; stage: string | null }>;
	materialReversed: number;
}

export interface RollbackReversalResult {
	summary: RollbackReversalSummary;
	warnings: string[];
}

const round = (n: number) => Math.round(n);
const msg = (err: unknown) => (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));

export async function reverseForRollback(args: {
	ot: { id: string; ot_number: string; quantity?: number | null; split_group_id?: string | null };
	toStatus: OTWorkflowStatus;
	actorId: string | null;
	/**
	 * Las etapas deshechas NO se trabajaron (la OT se movió por error): sus
	 * pasadas dejan de valer. `false` en un reproceso: las horas se gastaron.
	 */
	reversePasses: boolean;
	/** El material que salió para etapas posteriores vuelve a bodega. */
	returnMaterial: boolean;
}): Promise<RollbackReversalResult> {
	const { ot, toStatus, actorId } = args;
	const summary: RollbackReversalSummary = { passes: [], machineReversed: 0, laborReversed: 0, returned: [], materialReversed: 0 };
	const warnings: string[] = [];

	// ── El grupo, si la OT es parte de un trabajo partido ─────────────────
	let group: Array<SplitMember & { status: string }> = [];
	if (ot.split_group_id) {
		const { data, error } = await supabaseAdmin.from('ots').select('id, ot_number, status').eq('split_group_id', ot.split_group_id);
		if (error) warnings.push(`No se pudo leer el grupo de la OT partida (${error.message}): el reverso sólo miró esta OT.`);
		group = (data ?? []) as Array<SplitMember & { status: string }>;
	}
	const owner = splitOwner<SplitMember>({ id: ot.id, ot_number: ot.ot_number }, group);

	// ── Desde cuándo: la última vez que la OT llegó a la etapa destino ─────
	// Sin el historial no se sabe qué es del movimiento equivocado y qué de una
	// vuelta anterior que sí se trabajó: no se revierte nada a ciegas.
	const { data: historyData, error: historyError } = await supabaseAdmin
		.from('ot_status_history')
		.select('from_status, to_status, created_at, rollback, metadata')
		.eq('ot_id', ot.id)
		.order('created_at', { ascending: true });
	if (historyError) {
		warnings.push(`No se pudo leer el historial de la OT (${historyError.message}): no se revirtió ningún costo. Corregilo a mano.`);
		return { summary, warnings };
	}
	const history = (historyData ?? []) as HistoryRow[];
	const since = arrivedAt(history, toStatus);

	// ── 1. Las pasadas ────────────────────────────────────────────────────
	if (args.reversePasses) try {
		const { data: own, error } = await supabaseAdmin.from('ot_stage_reports').select('*').eq('ot_id', ot.id);
		if (error) throw error;
		const undone: Row[] = passesUndoneBy((own ?? []) as Row[] as Array<Row & { id: string; workflow_step: string }>, toStatus, since);

		// La pasada con la que nació el fragmento cuelga del padre.
		const birth = await birthPass(ot, toStatus, history, since, warnings);
		if (birth) undone.push(birth);

		if (undone.length > 0) {
			const ids = undone.map((p) => p.id as string);
			const { data: lines, error: linesError } = await supabaseAdmin
				.from('ot_cost_lines')
				.select('category, total, quantity, unit_cost')
				.eq('ref_type', STAGE_PASS_REF)
				.in('ref_id', ids);
			if (linesError) throw linesError;
			for (const l of lines ?? []) {
				const total = Number(l.total ?? Number(l.quantity) * Number(l.unit_cost));
				if (l.category === 'machine') summary.machineReversed += total;
				if (l.category === 'labor') summary.laborReversed += total;
			}

			const { error: deleteError } = await supabaseAdmin.from('ot_stage_reports').delete().in('id', ids);
			if (deleteError) throw deleteError;
			summary.passes = undone;
			summary.machineReversed = round(summary.machineReversed);
			summary.laborReversed = round(summary.laborReversed);

			// El libro es una función de las pasadas que existen: recalcular cada OT
			// tocada saca las líneas de máquina y mano de obra de las que ya no están.
			for (const otId of new Set(undone.map((p) => p.ot_id as string))) {
				try {
					await valueStagePasses(otId);
				} catch (err) {
					warnings.push(`Las pasadas se revirtieron, pero su costo de máquina y mano de obra no se pudo recalcular (${msg(err)}). Volvé a cerrar cualquier pasada de la OT para recalcularlo.`);
				}
			}
		}
	} catch (err) {
		warnings.push(`No se pudieron revertir las pasadas de las etapas deshechas: ${msg(err)}.`);
	}

	// ── 2. El material ────────────────────────────────────────────────────
	if (args.returnMaterial) try {
		const otIds = [...new Set([ot.id, owner.id])];
		const { data, error } = await supabaseAdmin
			.from('inventory_stock_transactions')
			.select('id, tx_type, lot_id, item_id, quantity, unit_cost, reference_code, notes, created_at, work_order_id')
			.in('work_order_id', otIds)
			.in('tx_type', ['consumption', 'return_to_stock']);
		if (error) throw error;
		const txs = (data ?? []) as Array<StockTx & { work_order_id: string }>;

		const toReturn: Array<StockTx & { work_order_id: string }> = [];
		let ambiguous = 0;
		const shared = new Set<string>();
		for (const otId of otIds) {
			const r = consumptionsUndoneBy(txs.filter((t) => t.work_order_id === otId), toStatus, since);
			ambiguous += r.ambiguous.length;
			for (const tx of r.toReturn) {
				// Lo que salió contra la dueña es de todo el grupo.
				if (otId === owner.id && group.length > 1 && stageStillInUse(group, ot.id, tx.notes ?? '')) shared.add(tx.notes ?? '');
				else toReturn.push(tx);
			}
		}

		if (toReturn.length > 0) {
			const note = `Retroceso de ${ot.ot_number} a ${otStatusLabel(toStatus)}: el material vuelve a bodega`;
			const { error: insertError } = await supabaseAdmin.from('inventory_stock_transactions').insert(
				toReturn.map((t) => ({
					item_id: t.item_id,
					lot_id: t.lot_id,
					tx_type: 'return_to_stock' as const,
					quantity: t.quantity,
					unit_cost: t.unit_cost,
					work_order_id: t.work_order_id,
					reference_code: t.reference_code,
					notes: note,
					created_by: actorId,
				})),
			);
			if (insertError) throw insertError;
			summary.returned = toReturn.map((t) => ({
				tx_id: t.id,
				lot: t.reference_code,
				quantity: Number(t.quantity),
				amount: round(Number(t.quantity) * Number(t.unit_cost ?? 0)),
				stage: t.notes,
			}));
			summary.materialReversed = summary.returned.reduce((s, r) => s + r.amount, 0);
		}
		for (const stage of shared) {
			warnings.push(`El material que salió al entrar a ${otStatusLabel(stage)} no volvió a bodega: otros fragmentos del trabajo siguen en esa etapa o más adelante.`);
		}
		if (ambiguous > 0) {
			warnings.push(`${ambiguous} salida(s) de material no se devolvieron solas: el lote ya tiene devoluciones parciales hechas a mano. Revisalo desde Bodega.`);
		}
	} catch (err) {
		warnings.push(`No se pudo devolver a bodega el material de las etapas deshechas: ${msg(err)}. Devolvelo desde Bodega.`);
	}

	return { summary, warnings };
}

/** La pasada del padre con la que nació este fragmento, si el retroceso la deshace. */
async function birthPass(
	ot: { id: string; quantity?: number | null },
	toStatus: OTWorkflowStatus,
	rows: HistoryRow[],
	since: string | null,
	warnings: string[],
): Promise<Row | null> {
	const meta = (r: { metadata: Json }) => (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? (r.metadata as Row) : {});
	const born = rows.find((r) => !r.rollback && meta(r).split_from_ot_id);
	if (!born?.from_status) return null;
	const parentId = String(meta(born).split_from_ot_id);

	// ¿El retroceso llega hasta la etapa de la que salió, o más atrás?
	// (Y si después de nacer ya volvió ahí por un reproceso, esa pasada es de
	// antes: se trabajó y se queda.)
	if (passesUndoneBy([{ id: 'x', workflow_step: born.from_status, created_at: born.created_at }], toStatus, since).length === 0) return null;
	// Un retroceso anterior ya la deshizo.
	const already = rows.some((r) => r.rollback && ((meta(r).reversal as Row | undefined)?.passes ?? []).some((p: Row) => p.ot_id === parentId));
	if (already) return null;

	const { data: parentPasses, error: passError } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('*')
		.eq('ot_id', parentId)
		.eq('workflow_step', born.from_status as OTWorkflowStatus);
	if (passError) throw passError;
	if ((parentPasses ?? []).length === 0) return null;

	const match = birthPassOf((parentPasses ?? []) as unknown as Array<Row & BirthPassCandidate>, {
		fromStatus: born.from_status,
		units: Number(ot.quantity ?? 0),
		at: born.created_at,
	});
	if (!match) {
		warnings.push(
			`Este fragmento volvió a ${otStatusLabel(toStatus)}, pero no se pudo identificar la pasada del avance parcial que lo creó ` +
				`(queda en la OT de origen, por ${otStatusLabel(born.from_status)}). Corregila a mano para que sus horas no se cuenten dos veces.`,
		);
	}
	return match;
}

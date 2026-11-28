/**
 * Mover una OT — la única implementación, para todas las puertas.
 *
 * El tablero (arrastrar), el avance parcial (dividir), el movimiento masivo y
 * el parte de WhatsApp mueven OTs. Hasta 2026-11 cada uno lo hacía a su manera:
 * la transición del tablero tenía todas las compuertas, la pasada, el backflush
 * y el aviso; el avance parcial validaba menos y no descontaba papel; el parte
 * de WhatsApp copiaba la validación y el UPDATE pero no descontaba papel ni
 * avisaba a nadie. Un mismo movimiento terminaba distinto según quién lo hacía.
 *
 * Esto es ese movimiento, una vez. Cada puerta autentica, limita y traduce su
 * entrada; lo que pasa al mover vive acá:
 *
 *   1. compuertas   — validateTransition con la ficha completa (buildOTSpec),
 *                     requisitos, pasadas abiertas, calidad interna y precio;
 *   2. el movimiento — UPDATE con guardia de concurrencia, o split_ot si es
 *                     parcial (el fragmento avanza, el resto se queda);
 *   1b. el papel     — entrar a la primera etapa de la ruta saca el papel de
 *                     bodega (paper-issue-server.ts): se exige el lote y los
 *                     pliegos, y sale ANTES de mover — si el lote está
 *                     retenido o sin certificado, la OT no se mueve;
 *   2. el movimiento — UPDATE con guardia de concurrencia, o split_ot si es
 *                     parcial (el fragmento avanza, el resto se queda);
 *   3. la pasada     — ot_stage_reports de la etapa que se deja (o se completa
 *                     una que ya existía, si quien mueve la cerró antes), y
 *                     con ella la máquina y la mano de obra (stage-valuation.ts);
 *   4. el reverso    — sólo en un retroceso declarado como movimiento equivocado:
 *                     las pasadas de las etapas deshechas dejan de valer (y con
 *                     ellas su máquina y su mano de obra) y el material de
 *                     etapas posteriores vuelve a bodega (rollback-reversal.ts).
 *                     Un reproceso conserva todo: esos costos se incurrieron;
 *   5. historial     — ot_status_history, con el canal a la vista;
 *   6. aviso         — el evento de dominio y sus notificaciones.
 *
 * El backflush (descontar los pliegos cotizados al DEJAR la etapa) se retiró
 * el 2026-11-11: el papel sale una vez, al entrar, con lo que de verdad salió.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Json } from '@/integrations/supabase/types';
import { isValidStatus, validateTransition, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { buildOTSpec, type OTSpec } from '@/lib/ot-spec';
import { estimatedHoursFor, promptsStageReport } from '@/lib/stage-report';
import { loadRoleAccess } from '@/lib/transition-rules';
import { dispatchNotifications, emitDomainEvent } from '@/lib/domain-events';
import {
	SPLIT_GROUP_SELECT,
	approvalOpensGate,
	inheritSpecColumns,
	lineageIds,
	splitOwner,
	type LineageApproval,
	type SplitMember,
} from '@/lib/ot-split-lineage';
import { valueStagePassesSafely } from '@/lib/stage-valuation';
import { resolvePassMachine } from '@/lib/stage-machine';
import { reverseForRollback, type RollbackReversalSummary } from '@/lib/rollback-reversal-server';
import { issuePaper, planPaperIssue, returnIssuedPaper, type PaperIssueLine } from '@/lib/paper-issue-server';
import type { AppRole } from '@/types/app-role';

export const PAPER_ISSUE_REQUIRED = 'PAPER_ISSUE_REQUIRED';

export const ROLLBACK_KINDS = ['reproceso', 'error_de_movimiento'] as const;
export type RollbackKind = (typeof ROLLBACK_KINDS)[number];

/** La ficha entera: las compuertas de completitud necesitan saber qué sabe la OT, no sólo dónde está. */
export const OT_MOVE_SELECT =
	'id, ot_number, status, client_id, product_name, product_type, quantity, ' +
	'width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back, ' +
	'ink_coverage, deadline, assigned_machine_id, substrate_brand, substrate_supplier, ' +
	'sin_arte, total_price, vb_id, split_group_id, ' +
	// Las banderas y el herramental: sin traerlos, la ficha llega con las
	// terminaciones vacías y ninguna compuerta condicional se dispara.
	'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, ' +
	'finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion, ' +
	'die_source, die_code, die_id, cliche_code, relieve_matrix_code, lamination_type, ' +
	// Lo que el motor calculó: contra esto se juzga el cierre de la etapa —
	// los pliegos dicen si la merma es del arreglo o de un problema, y las
	// horas estimadas hacen saltar un 40 escrito donde se esperaba un 4.
	'calc_sheets, calc_print_hours, calc_finish_hours';

export interface MoveActor {
	id: string | null;
	role: AppRole;
	name?: string | null;
}

/** El cierre de la etapa que se deja. Viaja CON el movimiento: si fueran dos llamadas, la que falla deja una OT movida sin horas. */
export interface StageReportInput {
	hours?: number | null;
	mermaSheets?: number | null;
	ajusteMinutes?: number | null;
	wasteNotes?: string | null;
	issues?: string | null;
	observations?: string | null;
	operatorEmployeeId?: string | null;
	/**
	 * La pasada ya existe —quien mueve la cerró antes de saber a dónde iba la OT—:
	 * se le completa el destino en vez de escribir una segunda con las mismas horas.
	 */
	passId?: string | null;
}

export interface MoveInput {
	otId: string;
	toStatus: OTWorkflowStatus;
	actor: MoveActor;
	stageReport?: StageReportInput | null;
	/** Avance parcial: unidades (las de `ots.quantity`) que pasan a `toStatus`; el resto se queda. */
	partialQuantity?: number | null;
	/**
	 * El papel que sale al entrar a la primera etapa de la ruta: de qué lote y
	 * cuántos pliegos. Obligatorio sólo ahí (si queda papel por sacar).
	 */
	paperIssue?: PaperIssueLine[] | null;
	rollback?: boolean;
	/**
	 * Por qué se retrocede. `reproceso` (y la ausencia): el trabajo se hizo y hay
	 * que rehacerlo — los costos quedan. `error_de_movimiento`: la OT se movió de
	 * más y las etapas no se trabajaron — sus pasadas y el material de etapas
	 * posteriores se revierten (rollback-reversal.ts).
	 */
	rollbackKind?: RollbackKind | null;
	reason?: string | null;
	metadata?: Record<string, unknown>;
}

export type MoveResult =
	| {
			ok: true;
			ot: { id: string; ot_number: string; status: string; updated_at?: string };
			/** Sólo en un avance parcial: el fragmento que avanzó, y lo que devuelve `split_ot`. */
			fragment?: { id: string; ot_number: string; quantity: number };
			split?: Record<string, unknown>;
			/** Sólo en un retroceso: lo que salió del libro de costos y lo que volvió a bodega. */
			reversal?: RollbackReversalSummary;
			warnings: string[];
	  }
	| { ok: false; status: number; error: string; code?: string };

type Row = Record<string, any>;

export async function moveOT(input: MoveInput): Promise<MoveResult> {
	const { otId, toStatus, actor } = input;
	const rollback = input.rollback ?? false;
	const r = input.stageReport ?? null;
	const partial = input.partialQuantity != null && input.partialQuantity > 0 ? input.partialQuantity : null;

	if (!isValidStatus(toStatus)) return { ok: false, status: 400, error: 'Estado destino inválido' };
	if (partial && rollback) return { ok: false, status: 400, error: 'Un retroceso no puede ser parcial.' };

	const { data: ot, error: otError } = await supabaseAdmin.from('ots').select(OT_MOVE_SELECT).eq('id', otId).single();
	if (otError || !ot) return { ok: false, status: 404, error: 'OT no encontrada' };

	// La cadena de `select` concatenada no la puede inferir el tipo generado, así
	// que la fila se lee suelta.
	const o = ot as unknown as Row;
	if (!isValidStatus(o.status)) return { ok: false, status: 409, error: 'OT tiene un estado actual inválido.' };
	const fromStatus = o.status as OTWorkflowStatus;

	// Una OT cancelada salió del flujo: no se mueve por ninguna puerta. Consulta
	// aparte y tolerante: en una base sin la migración 20261128120000 la columna
	// no existe, y ahí no hay nada cancelado que frenar.
	const { data: cancelRow, error: cancelError } = await supabaseAdmin
		.from('ots')
		.select('cancelled_at' as never)
		.eq('id', otId)
		.maybeSingle();
	if (!cancelError && (cancelRow as Row | null)?.cancelled_at) {
		return { ok: false, status: 409, error: 'La OT está cancelada: no se puede mover.', code: 'OT_CANCELADA' };
	}

	// ── 0. El linaje ───────────────────────────────────────────────────────
	//
	// Un fragmento nace con id propio y sin ninguna fila hija: el programa, las
	// operaciones, el arte, el visto bueno del cliente, los requisitos y los
	// costos siguen colgando de la OT de la que salió. Buscar la evidencia sólo
	// por su id lo dejaba sin salida (ot-split-lineage.ts). Si el grupo no se
	// puede leer, la OT responde por sí misma, como antes.
	let owner: Row = o;
	if (o.split_group_id) {
		const { data: grupo, error: grupoError } = await supabaseAdmin
			.from('ots')
			.select(SPLIT_GROUP_SELECT)
			.eq('split_group_id', o.split_group_id);
		if (grupoError) console.error('No se pudo leer el grupo de la OT partida:', grupoError);
		owner = splitOwner(o as SplitMember & Row, (grupo ?? []) as unknown as (SplitMember & Row)[]);
	}
	const linaje = lineageIds(o as SplitMember, owner as SplitMember);

	// ── 1. Compuertas ──────────────────────────────────────────────────────
	const [approvalResult, costsResult, roleAccess, programa, operaciones, arte, cotizacion, requisitos, abiertas] =
		await Promise.all([
			// Qué aprobación abre qué compuerta —el visto bueno del cliente vale para
			// todo el linaje; la calidad interna es propia y nunca la del portal
			// (auditoría 2026-10 §Quality)— lo decide `approvalOpensGate`.
			supabaseAdmin.from('ot_approvals').select('ot_id, status, confirmed_via, recorded_by').in('ot_id', linaje).eq('status', 'approved'),
			// «Hay costo real» se pregunta al libro (ot_cost_lines, kind actual): ahí
			// escriben el papel que salió, las pasadas y la mano de obra. Leía
			// `ot_real_costs`, que desde 2026-11 nadie escribe: ninguna OT nueva
			// podía despacharse ni completarse (hallado por hilo-dorado.test.ts).
			// Sobre todo el linaje: el papel de un grupo partido sale a nombre de
			// la dueña (paper-issue-server.ts), las pasadas a nombre de cada fragmento.
			supabaseAdmin.from('ot_cost_lines').select('id', { count: 'exact', head: true }).in('ot_id', linaje).eq('kind', 'actual'),
			loadRoleAccess(),
			// `impositionConfirmed` y `operationsReviewed` no son columnas: se deducen
			// de que exista lo que producen.
			supabaseAdmin.from('ot_machine_schedule').select('id', { count: 'exact', head: true }).in('ot_id', linaje),
			supabaseAdmin.from('ot_operations').select('id', { count: 'exact', head: true }).in('ot_id', linaje),
			supabaseAdmin.from('ot_attachments').select('id', { count: 'exact', head: true }).in('ot_id', linaje),
			o.vb_id
				? supabaseAdmin.from('vistos_buenos').select('total_price').eq('id', o.vb_id).maybeSingle()
				: Promise.resolve({ data: null }),
			// Lo que hay que conseguir es para el trabajo entero: el fragmento no
			// entra a bodega con un requisito de su dueña sin resolver.
			supabaseAdmin.from('ot_requirements').select('description, status').in('ot_id', linaje),
			supabaseAdmin.from('ot_stage_reports').select('id, workflow_step, created_at').eq('ot_id', otId).is('hours', null),
		]);

	const spec: OTSpec = buildOTSpec(inheritSpecColumns(o, owner), {
		impositionConfirmed: (programa.count ?? 0) > 0,
		operationsReviewed: (operaciones.count ?? 0) > 0,
		artAttached: (arte.count ?? 0) > 0,
	});

	// La pasada que esta misma operación va a completar no es una pasada abierta
	// que bloquee: es la que se está cerrando.
	const openPasses = (abiertas.data as { id: string; workflow_step: string; created_at: string }[] | null)
		?.filter((p) => p.id !== r?.passId);

	const check = validateTransition({
		fromStatus,
		toStatus,
		role: actor.role,
		roleAccess,
		spec,
		// Lo cotizado vive en el visto bueno; lo firme es el precio de la OT hoy.
		quotedPrice: (cotizacion as { data: { total_price?: number } | null })?.data?.total_price ?? null,
		firmPrice: o.total_price ?? null,
		repriceApproved: Boolean(input.metadata?.reprice_approved),
		hasApprovedApproval: ((approvalResult.data ?? []) as LineageApproval[]).some((a) => approvalOpensGate(toStatus, a, otId)),
		hasAnyRealCosts: (costsResult.count ?? 0) > 0,
		rollback,
		// `?? undefined` y no `?? []`: sin dato, la compuerta no corre — una lista
		// vacía significaría «no falta nada».
		requirements: (requisitos.data as { description: string; status: string }[] | null) ?? undefined,
		stageReport: r
			? { hours: r.hours ?? null, mermaSheets: r.mermaSheets ?? null, wasteNotes: r.wasteNotes ?? null, issues: r.issues ?? null, observations: r.observations ?? null }
			: null,
		stageReportContext: {
			// Los pliegos del trabajo ENTERO, también en un parcial: la merma de una
			// pasada se juzga contra el tiraje al que pertenece.
			enteredSheets: o.calc_sheets ?? null,
			estimatedHours: estimatedHoursFor(fromStatus, o),
		},
		openPasses: openPasses ?? undefined,
	});
	if (!check.ok) return { ok: false, status: 400, error: check.message ?? 'Transición no permitida.', code: check.code };

	// ── 1b. El papel sale al entrar ────────────────────────────────────────
	//
	// El pliego que entra a la primera etapa de la ruta es el mismo que sigue
	// por todas las demás: sale de bodega acá, una vez. Antes de mover, para que
	// un lote retenido o sin certificado deje la OT donde estaba.
	const warnings: string[] = [];
	let paperTx: string[] = [];
	if (!rollback) {
		let plan;
		try {
			plan = await planPaperIssue({ otId, toStatus, movedUnits: partial ?? Number(o.quantity ?? 0) });
		} catch (err) {
			return { ok: false, status: 500, error: err instanceof Error ? err.message : 'No se pudo calcular el papel que sale.' };
		}
		const lines = (input.paperIssue ?? []).filter((l) => l && l.lotId && l.sheets > 0);
		if (plan.required) {
			if (lines.length === 0) {
				return {
					ok: false,
					status: 400,
					code: PAPER_ISSUE_REQUIRED,
					error:
						`Entrar a ${plan.entryLabel} saca el papel de bodega: falta de qué lote y cuántos pliegos` +
						(plan.sheets > 0 ? ` (corresponden ${plan.sheets.toLocaleString('es-CL')}).` : '.'),
				};
			}
			try {
				const issued = await issuePaper({ ownerOtId: plan.ownerOtId, lines, actorId: actor.id, stage: toStatus });
				// Éxito: no va a `warnings` — el Tablero muestra cualquier aviso como
				// «cierre no guardado».
				paperTx = issued.txIds;
			} catch (err) {
				return { ok: false, status: 400, error: err instanceof Error ? err.message : 'No se pudo sacar el papel.' };
			}
		} else if (lines.length > 0) {
			warnings.push(
				plan.entryStatus === toStatus
					? 'El papel de este trabajo ya había salido de bodega: no se volvió a descontar.'
					: `El papel sale al entrar a ${plan.entryLabel ?? 'la primera etapa'}, no acá: no se descontó.`,
			);
		}
	}
	/** Si el papel ya salió y la OT no se pudo mover, vuelve a bodega. */
	const undoPaper = async (result: MoveResult): Promise<MoveResult> => {
		const w = await returnIssuedPaper(paperTx, actor.id);
		return w && !result.ok ? { ...result, error: `${result.error} ${w}` } : result;
	};

	// ── 2. El movimiento ───────────────────────────────────────────────────
	const nowIso = new Date().toISOString();
	let moved: { id: string; ot_number: string; status: string; updated_at?: string };
	let fragment: { id: string; ot_number: string; quantity: number } | undefined;
	let split: Record<string, unknown> | undefined;

	if (partial) {
		// Atómico en la base: achica el padre e inserta el fragmento.
		const { data, error } = await supabaseAdmin.rpc('split_ot', {
			p_ot_id: otId, p_advance_quantity: partial, p_target_status: toStatus,
		});
		if (error) return undoPaper({ ok: false, status: 400, error: error.message });
		split = data as Record<string, unknown>;
		const f = (split as { split?: { id: string; ot_number: string; quantity: number } }).split;
		if (f?.id) fragment = { id: f.id, ot_number: f.ot_number, quantity: Number(f.quantity) };
		// `split_ot` inserta el fragmento con `completed_at` en NULL sea cual sea el
		// destino: uno que nace terminado quedaba completado sin fecha.
		if (fragment && toStatus === 'completed') {
			const { error: closeError } = await supabaseAdmin.from('ots').update({ completed_at: nowIso }).eq('id', fragment.id);
			if (closeError) warnings.push('El fragmento quedó completado, pero sin fecha de término. Avisá para que se corrija.');
		}
		moved = { id: otId, ot_number: o.ot_number, status: fromStatus };
	} else {
		// Guardia de concurrencia: si otro la movió entre la lectura y esto, cero
		// filas y un 409 en vez de pisarlo. completed_at y flag_paper_arrived siguen
		// al estado (auditoría 2026-08-30, Run 1).
		const { data: updatedOt, error: updateError } = await supabaseAdmin
			.from('ots')
			.update({
				status: toStatus,
				updated_at: nowIso,
				completed_at: toStatus === 'completed' ? nowIso : fromStatus === 'completed' ? null : undefined,
				flag_paper_arrived: rollback && toStatus === 'paper_purchase' ? false : undefined,
			})
			.eq('id', otId)
			.eq('status', fromStatus)
			.select('id, ot_number, status, updated_at')
			.maybeSingle();
		if (updateError) return undoPaper({ ok: false, status: 500, error: 'No se pudo actualizar el estado de la OT' });
		if (!updatedOt) {
			return undoPaper({ ok: false, status: 409, error: 'La OT fue modificada por otra operación. Vuelve a intentarlo.', code: 'CONCURRENT_MODIFICATION' });
		}
		moved = updatedOt;
	}

	// ── 3. La pasada por la etapa ──────────────────────────────────────────
	//
	// SIEMPRE que la OT deja una etapa que se cierra, traiga o no horas: una fila
	// sin horas dice que pasó por acá y que el dato se debe. Contra el PADRE, que
	// es el que estuvo en la máquina. DESPUÉS del movimiento: la actualización es
	// la operación disputada, y una pasada escrita antes quedaría hablando de una
	// etapa que la OT nunca dejó. Un retroceso no abre nada.
	if (promptsStageReport(fromStatus) && !rollback) {
		const fields = {
			to_status: toStatus,
			...(partial ? { units_moved: Math.round(partial) } : {}),
			...(r?.hours != null ? { hours: r.hours } : {}),
			...(r?.mermaSheets != null ? { merma_sheets: r.mermaSheets } : {}),
			...(fromStatus === 'offset_printing' && r?.ajusteMinutes ? { ajuste_minutes: Math.round(r.ajusteMinutes) } : {}),
			...(r?.wasteNotes?.trim() ? { waste_notes: r.wasteNotes.trim() } : {}),
			...(r?.issues?.trim() ? { issues: r.issues.trim() } : {}),
			...(r?.observations?.trim() ? { observations: r.observations.trim() } : {}),
			...(r?.operatorEmployeeId ? { operator_employee_id: r.operatorEmployeeId } : {}),
		};
		const { error: reportError } = r?.passId
			? await supabaseAdmin.from('ot_stage_reports').update(fields).eq('id', r.passId)
			: await supabaseAdmin.from('ot_stage_reports').insert({
					ot_id: otId,
					workflow_step: fromStatus,
					hours: null,
					// La máquina que corrió la etapa —la guillotina en el corte, no la prensa
					// asignada—: de ella salen la tarifa y la gente de Planta (stage-machine.ts).
					machine_id: await resolvePassMachine(otId, fromStatus, o.assigned_machine_id),
					recorded_by: actor.id,
					...fields,
				});
		if (reportError) {
			warnings.push('La OT avanzó, pero la pasada por la etapa no quedó registrada. Avisá para que se cargue a mano.');
		} else if (r?.hours != null) {
			// Las horas de la pasada se vuelven costo de máquina, a la tarifa con
			// que se cotizó, y de mano de obra, por la gente que Planta tenía en la
			// máquina en ese turno (stage-valuation.ts).
			const w = await valueStagePassesSafely(otId);
			if (w) warnings.push(w);
		}
	}

	// ── 4. El reverso de un retroceso ──────────────────────────────────────
	//
	// Volver atrás deshace lo que las etapas des-hechas dejaron en el libro: sus
	// pasadas (y con ellas el tiempo de máquina y la mano de obra) y el material
	// que salió para entrar a etapas posteriores. Sin esto, la OT volvía a avanzar
	// y cobraba las mismas horas dos veces (rollback-reversal.ts). Lo deshecho
	// queda entero en el historial del retroceso, más abajo.
	//
	// Sólo si quien retrocede dijo que fue un movimiento equivocado. Un reproceso
	// —el caso normal: hubo un error en producción y la OT vuelve a un proceso
	// anterior— conserva todo, porque esos costos se incurrieron. Sin indicación
	// no se revierte nada: sacar costo del libro es una decisión, no un efecto
	// secundario de mover una tarjeta.
	let reversal: RollbackReversalSummary | undefined;
	if (rollback && input.rollbackKind === 'error_de_movimiento') {
		const rev = await reverseForRollback({
			ot: { id: otId, ot_number: o.ot_number, quantity: o.quantity, split_group_id: o.split_group_id },
			toStatus,
			actorId: actor.id,
			reversePasses: true,
			returnMaterial: true,
		});
		reversal = rev.summary;
		warnings.push(...rev.warnings);
	}

	// ── 5. Historial ───────────────────────────────────────────────────────
	// Best-effort: no bloquea el movimiento. En un parcial habla del fragmento,
	// que es el que cambió de columna.
	const movedId = fragment?.id ?? otId;
	const { error: historyError } = await supabaseAdmin.from('ot_status_history').insert({
		ot_id: movedId,
		from_status: fromStatus,
		to_status: toStatus,
		changed_by: actor.id,
		changed_by_role: actor.role,
		reason: input.reason ?? null,
		rollback,
		metadata: {
			...(input.metadata ?? {}),
			...(fragment ? { split_from_ot_id: otId } : {}),
			...(rollback && input.rollbackKind ? { rollback_kind: input.rollbackKind } : {}),
			...(reversal ? { reversal } : {}),
		} as unknown as Json,
	});
	if (historyError) console.error('Error writing OT status history:', historyError);

	// ── 6. Aviso ───────────────────────────────────────────────────────────
	// `dispatchNotifications` decide sola si `toStatus` es un hito.
	const event = await emitDomainEvent({
		type: 'ot.status_changed',
		otId: movedId,
		actorId: actor.id,
		actorRole: actor.role,
		payload: {
			ot_number: fragment?.ot_number ?? moved.ot_number,
			from_status: fromStatus,
			to_status: toStatus,
			by_role: actor.role,
			actor_name: actor.name ?? null,
			reason: input.reason ?? null,
			rollback,
			transition_metadata: input.metadata ?? {},
			...(fragment ? { split_from_ot_id: otId } : {}),
		},
	});
	if (event) await dispatchNotifications(event);

	return { ok: true, ot: moved, ...(fragment ? { fragment, split } : {}), ...(reversal ? { reversal } : {}), warnings };
}

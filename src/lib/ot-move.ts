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
import { cuentaParaCalidadInterna } from '@/lib/ot-approval-origin';
import { valueStagePassesSafely } from '@/lib/stage-valuation';
import { resolvePassMachine } from '@/lib/stage-machine';
import { issuePaper, planPaperIssue, returnIssuedPaper, type PaperIssueLine } from '@/lib/paper-issue-server';
import type { AppRole } from '@/types/app-role';

export const PAPER_ISSUE_REQUIRED = 'PAPER_ISSUE_REQUIRED';

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

	// ── 1. Compuertas ──────────────────────────────────────────────────────
	const [approvalResult, costsResult, roleAccess, programa, operaciones, arte, cotizacion, requisitos, abiertas] =
		await Promise.all([
			// La compuerta de calidad NO cuenta lo que firmó el portal público
			// (auditoría 2026-10 §Quality); el predicado vive en `cuentaParaCalidadInterna`.
			supabaseAdmin.from('ot_approvals').select('status, confirmed_via, recorded_by').eq('ot_id', otId).eq('status', 'approved'),
			supabaseAdmin.from('ot_real_costs').select('id', { count: 'exact', head: true }).eq('ot_id', otId),
			loadRoleAccess(),
			// `impositionConfirmed` y `operationsReviewed` no son columnas: se deducen
			// de que exista lo que producen.
			supabaseAdmin.from('ot_machine_schedule').select('id', { count: 'exact', head: true }).eq('ot_id', otId),
			supabaseAdmin.from('ot_operations').select('id', { count: 'exact', head: true }).eq('ot_id', otId),
			supabaseAdmin.from('ot_attachments').select('id', { count: 'exact', head: true }).eq('ot_id', otId),
			o.vb_id
				? supabaseAdmin.from('vistos_buenos').select('total_price').eq('id', o.vb_id).maybeSingle()
				: Promise.resolve({ data: null }),
			supabaseAdmin.from('ot_requirements').select('description, status').eq('ot_id', otId),
			supabaseAdmin.from('ot_stage_reports').select('id, workflow_step, created_at').eq('ot_id', otId).is('hours', null),
		]);

	const spec: OTSpec = buildOTSpec(o, {
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
		hasApprovedApproval: (approvalResult.data ?? []).some(cuentaParaCalidadInterna),
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
		metadata: { ...(input.metadata ?? {}), ...(fragment ? { split_from_ot_id: otId } : {}) } as unknown as Json,
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

	return { ok: true, ot: moved, ...(fragment ? { fragment, split } : {}), warnings };
}

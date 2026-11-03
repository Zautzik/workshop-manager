/**
 * Aplicar el parte del taller: cerrar la pasada y mover la OT.
 *
 * Es el eslabón que faltaba. El parser entendía los mensajes desde hace meses y
 * el router de capturas sólo sabía escribir líneas de costo: las horas, la
 * merma y los problemas se guardaban en `parsed_data` y no los leía nadie, y
 * ningún mensaje movía una OT del tablero.
 *
 * ── Por qué reusa las rutas y no escribe directo ────────────────────────────
 *
 * Mover una OT tiene compuertas —rol, orden del recorrido, requisitos de
 * compras, aprobación de calidad, pasadas abiertas— y todas viven en
 * `validateTransition`. Un camino que escriba `ots.status` por su cuenta las
 * saltea todas, y entonces la regla deja de ser una regla: pasa a ser algo que
 * se cumple sólo si entraste por la puerta correcta. El mensaje del prensista
 * atraviesa exactamente las mismas compuertas que el arrastre del supervisor.
 *
 * ── Qué pasa cuando la compuerta dice que no ────────────────────────────────
 *
 * No se pierde nada. La pasada se cierra igual —las horas son ciertas aunque la
 * OT no pueda avanzar— y el motivo vuelve para que quede escrito en la captura.
 * Un parte rechazado entero por un requisito de compras habría tirado a la
 * basura el único dato que nadie más tiene.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { OTStatusSchema, validateTransition, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { promptsStageReport } from '@/lib/stage-report';
import type { FlowProposal } from '@/lib/whatsapp-flow';
import type { AppRole } from '@/types/app-role';

export interface ApplyActor {
	id: string | null;
	role: AppRole;
}

/**
 * Lo que la captura sabe del parte además del texto: quién lo mandó y cuándo.
 * Quien manda «ajuste 40 min» desde su teléfono ES quien ajustó — mejor dato
 * que deducirlo de la asignación del día (`ajuste.ts`).
 */
export interface ApplyEvidence {
	operatorEmployeeId?: string | null;
	messageTimestamp?: string | null;
}

export interface ApplyOutcome {
	/** Se cerró una pasada con las horas del parte. */
	closed: { id: string; workflow_step: string; hours: number | null } | null;
	/** La OT se movió. */
	moved: { from: string; to: string } | null;
	/** Por qué no se movió, cuando corresponde. Va a la captura, no se pierde. */
	blocked: string | null;
	notes: string[];
}

/**
 * Cerrar la pasada abierta de esta etapa, o abrir una ya cerrada si no había.
 *
 * El segundo caso es el normal cuando el operario avisa antes de que nadie
 * toque el tablero: la OT nunca salió de la etapa, así que no existe una pasada
 * abierta que completar. Crear la fila igual es lo correcto — el trabajo se
 * hizo y las horas son reales—; lo que no se hace es inventar el movimiento.
 */
/** Ajuste y operario: sólo se escriben si hay dato (y el ajuste, sólo en offset). */
function evidenceFields(stage: string, p: FlowProposal, evidence: ApplyEvidence) {
	return {
		...(stage === 'offset_printing' && p.ajusteMinutes ? { ajuste_minutes: Math.round(p.ajusteMinutes) } : {}),
		...(evidence.operatorEmployeeId ? { operator_employee_id: evidence.operatorEmployeeId } : {}),
	};
}

/**
 * Parte retroactivo: completar la pasada de una etapa que la OT ya dejó.
 *
 * Sólo se llenan los campos VACÍOS. Las horas que el supervisor ya cerró en el
 * tablero son evidencia y no se pisan con las de un mensaje que llegó después;
 * lo que sí entra es lo que nadie había dicho —típicamente el ajuste, o las
 * horas de una pasada que quedó abierta—. Ese dato tardío es el que afina las
 * estimaciones de las OT que vienen.
 *
 * Si la etapa no tiene ninguna pasada (la OT la salteó en el tablero sin
 * cerrar), se crea una con la fecha del MENSAJE, no la de la aprobación: el
 * día en que se hizo el trabajo es el que dice quién estaba en la máquina.
 */
async function enrichPastPass(
	otId: string,
	stage: string,
	p: FlowProposal,
	actor: ApplyActor,
	machineId: string | null,
	evidence: ApplyEvidence,
): Promise<{ closed: ApplyOutcome['closed']; note: string }> {
	const { data: rows, error } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('*')
		.eq('ot_id', otId)
		.eq('workflow_step', stage as never)
		.order('created_at', { ascending: false })
		.limit(1);
	if (error) throw new Error(`No se pudo buscar la pasada de ${stage}: ${error.message}`);
	const pass = (rows?.[0] ?? null) as Record<string, any> | null;

	const extra = evidenceFields(stage, p, evidence);
	if (pass) {
		const patch: {
			hours?: number;
			merma_sheets?: number;
			issues?: string;
			ajuste_minutes?: number;
			operator_employee_id?: string;
			recorded_by?: string | null;
		} = {};
		if (pass.hours == null && p.hours) patch.hours = p.hours;
		if (pass.merma_sheets == null && p.mermaSheets != null) patch.merma_sheets = p.mermaSheets;
		if (pass.issues == null && p.issues) patch.issues = p.issues;
		if (pass.ajuste_minutes == null && extra.ajuste_minutes) patch.ajuste_minutes = extra.ajuste_minutes;
		if (pass.operator_employee_id == null && extra.operator_employee_id) patch.operator_employee_id = extra.operator_employee_id;
		if (Object.keys(patch).length === 0) {
			return { closed: null, note: `Parte retroactivo de ${stage}: la pasada ya tenía todos esos datos; no se cambió nada.` };
		}
		if (patch.hours != null) patch.recorded_by = actor.id;
		const { data, error: upErr } = await supabaseAdmin
			.from('ot_stage_reports')
			.update(patch)
			.eq('id', pass.id)
			.select('id, workflow_step, hours')
			.maybeSingle();
		if (upErr) throw new Error(`No se pudo completar la pasada de ${stage}: ${upErr.message}`);
		return { closed: data ?? null, note: `Parte retroactivo de ${stage}: se completó ${Object.keys(patch).filter((k) => k !== 'recorded_by').join(', ')}.` };
	}

	if (!p.hours) {
		return { closed: null, note: `Parte retroactivo de ${stage} sin horas y sin pasada que completar: no se registró.` };
	}
	const { data, error: insErr } = await supabaseAdmin
		.from('ot_stage_reports')
		.insert({
			ot_id: otId,
			workflow_step: stage as never,
			machine_id: machineId,
			hours: p.hours,
			merma_sheets: p.mermaSheets,
			issues: p.issues,
			recorded_by: actor.id,
			...(evidence.messageTimestamp ? { created_at: evidence.messageTimestamp } : {}),
			...extra,
		})
		.select('id, workflow_step, hours')
		.maybeSingle();
	if (insErr) throw new Error(`No se pudo registrar la pasada de ${stage}: ${insErr.message}`);
	return { closed: data ?? null, note: `Parte retroactivo de ${stage}: se registró la pasada con la fecha del mensaje.` };
}

async function closePass(
	otId: string,
	stage: string,
	p: FlowProposal,
	actor: ApplyActor,
	machineId: string | null,
	evidence: ApplyEvidence,
): Promise<ApplyOutcome['closed']> {
	// La más vieja primero: si un avance parcial dejó dos pasadas abiertas por la
	// misma etapa, el parte que llega cierra la que lleva más tiempo esperando.
	const { data: abierta, error: buscarErr } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('id')
		.eq('ot_id', otId)
		.eq('workflow_step', stage as never)
		.is('hours', null)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	// Un error acá NO es "no hay pasada abierta" — leerlo así insertaría una
	// fila nueva junto a la que ya existe, duplicando el rastro de horas en vez
	// de cerrarlo (auditoría 2026-08).
	if (buscarErr) throw new Error(`No se pudo buscar la pasada abierta: ${buscarErr.message}`);

	const campos = {
		hours: p.hours,
		merma_sheets: p.mermaSheets,
		issues: p.issues,
		observations: p.observations,
		recorded_by: actor.id,
		...evidenceFields(stage, p, evidence),
	};

	if (abierta) {
		// `.is('hours', null)` otra vez: entre la lectura y el UPDATE puede haber
		// entrado el supervisor por el tablero, y el que llega segundo no pisa.
		// Cero filas afectadas por esa carrera es un resultado legítimo — `data`
		// en null sin `error` sigue devolviendo null más abajo, sin tocarlo.
		const { data, error } = await supabaseAdmin
			.from('ot_stage_reports')
			.update(campos)
			.eq('id', abierta.id)
			.is('hours', null)
			.select('id, workflow_step, hours')
			.maybeSingle();
		if (error) throw new Error(`No se pudo cerrar la pasada: ${error.message}`);
		return data ?? null;
	}

	const { data, error } = await supabaseAdmin
		.from('ot_stage_reports')
		.insert({
			ot_id: otId,
			workflow_step: stage as never,
			machine_id: machineId,
			...campos,
		})
		.select('id, workflow_step, hours')
		.maybeSingle();
	if (error) throw new Error(`No se pudo registrar la pasada: ${error.message}`);
	return data ?? null;
}

/**
 * Lo que este parte le hace a la OT, hecho.
 *
 * Idempotente en lo que importa: si la OT ya se movió sola, la transición falla
 * por orden del recorrido y se registra como bloqueada en vez de duplicar nada.
 */
export async function applyFlowProposal(
	otId: string,
	proposal: FlowProposal,
	actor: ApplyActor,
	evidence: ApplyEvidence = {},
): Promise<ApplyOutcome> {
	const out: ApplyOutcome = { closed: null, moved: null, blocked: null, notes: [] };

	const { data: ot, error: otErr } = await supabaseAdmin
		.from('ots')
		.select('id, status, assigned_machine_id')
		.eq('id', otId)
		.maybeSingle();

	// "No se pudo verificar" y "no existe" son motivos distintos y uno de los
	// dos es transitorio — decirle al que mandó el parte que su OT desapareció
	// por un corte de red sería peor que no contestar nada.
	if (otErr) {
		out.blocked = `No se pudo verificar la OT: ${otErr.message}`;
		return out;
	}
	if (!ot) {
		out.blocked = 'La OT ya no existe.';
		return out;
	}

	const fromStatus = ot.status as OTWorkflowStatus;
	const order = OTStatusSchema.options;

	// Parte de una etapa que la OT ya dejó: lo dijo el mensaje (`retroactive`) o
	// la OT se movió entre que llegó el mensaje y que se aprobó. En los dos casos
	// el dato es cierto y va a la pasada de ESA etapa, sin mover nada. Antes se
	// descartaba con una nota, y con él el único registro de cuánto tomó.
	const isPast =
		proposal.closeStage != null &&
		promptsStageReport(proposal.closeStage) &&
		order.indexOf(proposal.closeStage) < order.indexOf(fromStatus);
	if (proposal.closeStage && (proposal.retroactive || isPast)) {
		if (!isPast) {
			out.notes.push(`El parte hablaba de ${proposal.closeStage} y la OT está en ${fromStatus}: no se aplicó.`);
			return out;
		}
		try {
			const r = await enrichPastPass(otId, proposal.closeStage, proposal, actor, ot.assigned_machine_id ?? null, evidence);
			out.closed = r.closed;
			out.notes.push(r.note);
		} catch (err) {
			out.notes.push(err instanceof Error ? err.message : 'No se pudo completar la pasada.');
		}
		return out;
	}

	// El parte se resolvió contra el estado que la OT tenía cuando llegó el
	// mensaje. Si mientras tanto alguien la movió HACIA ATRÁS (un retroceso), lo
	// que decía ya no aplica: se deja constancia en vez de cerrar la pasada
	// equivocada.
	if (proposal.closeStage && proposal.closeStage !== fromStatus) {
		out.notes.push(
			`El parte hablaba de ${proposal.closeStage} y la OT ya está en ${fromStatus}: ` +
			'alguien la movió mientras tanto.',
		);
	} else if (proposal.closeStage && promptsStageReport(fromStatus)) {
		// `closePass` lanza en vez de devolver silencioso ante un error de
		// lectura/escritura real — acá se atrapa para no perder el resto del
		// parte (las horas son ciertas aunque cerrar la pasada haya fallado).
		try {
			out.closed = await closePass(
				otId,
				proposal.closeStage,
				proposal,
				actor,
				ot.assigned_machine_id ?? null,
				evidence,
			);
			if (!out.closed) out.notes.push('La pasada ya estaba cerrada por otra vía.');
		} catch (err) {
			out.notes.push(err instanceof Error ? err.message : 'No se pudo cerrar la pasada.');
		}
	}

	if (!proposal.nextStatus) return out;

	// Las mismas compuertas que el tablero, incluida la de pasadas abiertas: si
	// la OT se va a despachar debiendo horas de otra etapa, el parte del que
	// reparte no la deja pasar tampoco.
	const [approval, costs, openPasses] = await Promise.all([
		supabaseAdmin.from('ot_approvals').select('id', { count: 'exact', head: true })
			.eq('ot_id', otId).eq('status', 'approved'),
		supabaseAdmin.from('ot_real_costs').select('id', { count: 'exact', head: true })
			.eq('ot_id', otId),
		supabaseAdmin.from('ot_stage_reports').select('workflow_step, created_at')
			.eq('ot_id', otId).is('hours', null),
	]);

	const check = validateTransition({
		fromStatus,
		toStatus: proposal.nextStatus,
		role: actor.role,
		hasApprovedApproval: (approval.count ?? 0) > 0,
		hasAnyRealCosts: (costs.count ?? 0) > 0,
		openPasses:
			(openPasses.data as { workflow_step: string; created_at: string }[] | null) ?? undefined,
	});

	if (!check.ok) {
		out.blocked = check.message ?? 'La OT no puede avanzar todavía.';
		return out;
	}

	const nowIso = new Date().toISOString();
	const { data: updated, error: updateErr } = await supabaseAdmin
		.from('ots')
		.update({
			status: proposal.nextStatus,
			updated_at: nowIso,
			completed_at: proposal.nextStatus === 'completed' ? nowIso : undefined,
		})
		.eq('id', otId)
		// El mismo guardia de concurrencia que la ruta de transición: si otro la
		// movió entre la validación y esto, no se pisa.
		.eq('status', fromStatus)
		.select('id, status')
		.maybeSingle();

	// Cero filas (carrera perdida) y un error real son cosas distintas — la
	// primera es "otro te ganó", la segunda es "no se pudo ni intentar", y
	// decirle al prensista que alguien más movió su OT cuando en realidad la
	// base falló le hace desconfiar de la OT equivocada.
	if (updateErr) {
		out.blocked = `No se pudo mover la OT: ${updateErr.message}`;
		return out;
	}
	if (!updated) {
		out.blocked = 'La OT fue movida por otra operación mientras se aplicaba el parte.';
		return out;
	}

	out.moved = { from: fromStatus, to: proposal.nextStatus };

	// La pasada de la etapa que la OT acaba de dejar, si el parte no la cerró
	// —porque no traía horas—. Queda abierta: el rastro existe y la deuda se ve.
	if (promptsStageReport(fromStatus) && !out.closed) {
		await supabaseAdmin.from('ot_stage_reports').insert({
			ot_id: otId,
			workflow_step: fromStatus as never,
			to_status: proposal.nextStatus,
			hours: null,
			machine_id: ot.assigned_machine_id ?? null,
			recorded_by: actor.id,
		});
	} else if (out.closed) {
		// Se cerró antes de saber a dónde iba: ahora se completa el destino.
		await supabaseAdmin
			.from('ot_stage_reports')
			.update({ to_status: proposal.nextStatus })
			.eq('id', out.closed.id);
	}

	// El historial es el mismo que escribe el tablero, con el canal a la vista:
	// una auditoría tiene que poder distinguir un movimiento decidido por una
	// persona frente a la pantalla de uno inferido de un mensaje de texto.
	await supabaseAdmin.from('ot_status_history').insert({
		ot_id: otId,
		from_status: fromStatus,
		to_status: proposal.nextStatus,
		changed_by: actor.id,
		changed_by_role: actor.role,
		reason: 'whatsapp_parte',
		rollback: false,
		metadata: {
			channel: 'whatsapp',
			confidence: proposal.confidence,
			resolution: proposal.reason,
		},
	});

	return out;
}

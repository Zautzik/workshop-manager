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
import { validateTransition, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { promptsStageReport } from '@/lib/stage-report';
import type { FlowProposal } from '@/lib/whatsapp-flow';
import type { AppRole } from '@/types/app-role';

export interface ApplyActor {
	id: string | null;
	role: AppRole;
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
async function closePass(
	otId: string,
	stage: string,
	p: FlowProposal,
	actor: ApplyActor,
	machineId: string | null,
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

	// El parte se resolvió contra el estado que la OT tenía cuando llegó el
	// mensaje. Si mientras tanto alguien la movió, lo que decía ya no aplica: se
	// deja constancia en vez de cerrar la pasada equivocada.
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

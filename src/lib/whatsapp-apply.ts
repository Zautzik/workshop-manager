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
import { OTStatusSchema, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { promptsStageReport } from '@/lib/stage-report';
import { nextStatusOnRoute, type RouteOT } from '@/lib/production-route';
import { moveOT } from '@/lib/ot-move';
import type { FlowContext, FlowProposal } from '@/lib/whatsapp-flow';
import type { AppRole } from '@/types/app-role';

export interface ApplyActor {
	id: string | null;
	role: AppRole;
	name?: string | null;
}

/* ─── Lo que la OT sabe de sí misma ─────────────────────────────────────── */

/**
 * La base para resolver un parte contra ESTA OT: su ruta y sus pliegos.
 *
 * `stageSheets` son los pliegos de la OT tal como está hoy. `calc_sheets` es
 * del trabajo entero y `split_ot` lo copia igual a cada fragmento; lo que
 * cambia es `quantity`. Así que los pliegos de un fragmento son su parte de la
 * cantidad del grupo, y la misma razón convierte los pliegos del parte en las
 * unidades que `split_ot` avanza.
 */
export interface OTBasis {
	ctx: FlowContext;
	/** Unidades (`ots.quantity`) por pliego; null si la OT no tiene pliegos calculados. */
	unitsPerSheet: number | null;
	quantity: number;
}

const ROUTE_FIELDS =
	'id, status, quantity, product_type, color_front, color_back, calc_sheets, calc_print_hours, calc_finish_hours, ' +
	'assigned_machine_id, die_id, die_code, flag_paper_arrived, split_group_id, finish_troquelado, finish_plegado, ' +
	'finish_pegado, finish_laminado, finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping, ' +
	'finish_uv_localizado, finish_numeracion';

export async function loadOTBasis(otId: string, atStatus?: string): Promise<OTBasis | null> {
	const { data, error } = await supabaseAdmin.from('ots').select(ROUTE_FIELDS).eq('id', otId).maybeSingle();
	if (error || !data) return null;
	const ot = data as unknown as RouteOT & { quantity: number; split_group_id: string | null };

	const [machine, group] = await Promise.all([
		ot.assigned_machine_id
			? supabaseAdmin.from('machines').select('id, type').eq('id', ot.assigned_machine_id).maybeSingle()
			: Promise.resolve({ data: null }),
		ot.split_group_id
			? supabaseAdmin.from('ots').select('quantity').eq('split_group_id', ot.split_group_id)
			: Promise.resolve({ data: null }),
	]);
	const machineTypeById = new Map<string, string>();
	const m = machine.data as { id: string; type: string } | null;
	if (m?.type) machineTypeById.set(m.id, m.type);

	const quantity = Number(ot.quantity ?? 0);
	const groupQty =
		(group.data as { quantity: number }[] | null)?.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0) || quantity;
	const sheets = Number(ot.calc_sheets ?? 0);
	const unitsPerSheet = sheets > 0 && groupQty > 0 ? groupQty / sheets : null;

	return {
		quantity,
		unitsPerSheet,
		ctx: {
			routeNext: nextStatusOnRoute(ot, atStatus ?? ot.status, machineTypeById),
			stageSheets: unitsPerSheet ? quantity / unitsPerSheet : null,
		},
	};
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
	/** La OT se movió. En un avance parcial, `fragment` es la parte que avanzó. */
	moved: { from: string; to: string; fragment?: { id: string; ot_number: string; quantity: number } } | null;
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
	// dos es transitorio.
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
	// la OT se movió entre que llegó el mensaje y que se aprobó. El dato es cierto
	// y va a la pasada de ESA etapa, sin mover nada.
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

	// Alguien la movió HACIA ATRÁS mientras tanto: lo que decía ya no aplica.
	if (proposal.closeStage && proposal.closeStage !== fromStatus) {
		out.notes.push(
			`El parte hablaba de ${proposal.closeStage} y la OT ya está en ${fromStatus}: alguien la movió mientras tanto.`,
		);
		return out;
	}

	/** Cerrar la pasada sin mover: las horas son ciertas aunque la OT no avance. */
	const closeOnly = async () => {
		if (!proposal.closeStage || !promptsStageReport(fromStatus)) return;
		try {
			out.closed = await closePass(otId, proposal.closeStage, proposal, actor, ot.assigned_machine_id ?? null, evidence);
			if (!out.closed) out.notes.push('La pasada ya estaba cerrada por otra vía.');
		} catch (err) {
			out.notes.push(err instanceof Error ? err.message : 'No se pudo cerrar la pasada.');
		}
	};

	if (!proposal.nextStatus) {
		await closeOnly();
		return out;
	}

	// ── Mover: el MISMO movimiento que el tablero (`moveOT`) ─────────────────
	//
	// Mismas compuertas, misma pasada, mismo backflush, mismo aviso. Antes esto
	// tenía su propia copia de la validación y el UPDATE, y un movimiento por
	// WhatsApp no descontaba papel ni avisaba a nadie.
	let partialQuantity: number | null = null;
	if (proposal.partialSheets) {
		const basis = await loadOTBasis(otId);
		const units = basis?.unitsPerSheet ? Math.round(proposal.partialSheets * basis.unitsPerSheet) : null;
		// Unidades que no dejan resto son un avance completo, no uno parcial.
		if (units && basis && units > 0 && units < basis.quantity) partialQuantity = units;
	}

	// Si la etapa ya tiene una pasada sin cerrar ni destino (la OT llegó acá por
	// el tablero sin horas, o se cerró antes de saber a dónde iba), el parte la
	// completa en vez de escribir una segunda con las mismas horas.
	const { data: pendiente, error: pendienteErr } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('id')
		.eq('ot_id', otId)
		.eq('workflow_step', fromStatus as never)
		.is('to_status', null)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	// Sin poder leerlo, mover escribiría una segunda pasada con las mismas horas.
	if (pendienteErr) {
		out.blocked = `No se pudo leer la pasada de la etapa: ${pendienteErr.message}`;
		return out;
	}

	const moved = await moveOT({
		otId,
		toStatus: proposal.nextStatus,
		actor,
		partialQuantity,
		stageReport: {
			hours: proposal.hours,
			mermaSheets: proposal.mermaSheets,
			ajusteMinutes: proposal.ajusteMinutes,
			issues: proposal.issues,
			observations: proposal.observations,
			operatorEmployeeId: evidence.operatorEmployeeId ?? null,
			passId: (pendiente as { id: string } | null)?.id ?? null,
		},
		// El historial distingue un movimiento decidido frente a la pantalla de
		// uno inferido de un mensaje de texto.
		reason: 'whatsapp_parte',
		metadata: { channel: 'whatsapp', confidence: proposal.confidence, resolution: proposal.reason },
	});

	if (!moved.ok) {
		// La compuerta dijo que no: no se pierde nada. La pasada se cierra igual y
		// el motivo vuelve para que quede escrito en la captura.
		out.blocked = moved.error;
		await closeOnly();
		return out;
	}

	out.moved = { from: fromStatus, to: proposal.nextStatus, ...(moved.fragment ? { fragment: moved.fragment } : {}) };
	out.notes.push(...moved.warnings);
	return out;
}

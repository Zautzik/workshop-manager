/**
 * Aplicar un parte de producción aprobado: lo que pasa DESPUÉS de la plata.
 *
 * Hay tres botones de aprobar —captura, log de WhatsApp, y el masivo— y hasta
 * 2026-11 sólo el de capturas movía la OT. Los otros dos registraban costos y
 * nada más: el supervisor aprobaba «fin 41221» y el tablero no se enteraba. El
 * espejo legado → capture_events marcaba la captura `applied`, así que además
 * parecía procesada. Esto es el paso compartido, para que no vuelvan a divergir.
 *
 * ── Contra qué estado se resuelve el parte ──────────────────────────────────
 *
 * Contra el que la OT tenía cuando el operario MANDÓ el mensaje, no cuando el
 * supervisor lo aprobó. Un «fin» de hace una semana habla de la etapa de hace
 * una semana; resolverlo contra la de hoy cerraba la guillotina con las horas
 * de la prensa y adelantaba la OT una etapa de más. Con el estado del momento,
 * `applyFlowProposal` ve que la etapa ya quedó atrás y completa ESA pasada sin
 * mover nada — el camino que ya existía y nunca recibía el dato.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveFlow } from '@/lib/whatsapp-flow';
import { applyFlowProposal, loadOTBasis, type ApplyActor, type ApplyOutcome } from '@/lib/whatsapp-apply';
import type { FlowProposal } from '@/lib/whatsapp-flow';

export interface ApprovedReport {
	otId: string;
	eventType: string | null;
	/** `corrected_data ?? parsed_data`: lo que el supervisor dejó como cierto. */
	parsed: Record<string, unknown>;
	operatorEmployeeId?: string | null;
	messageTimestamp?: string | null;
}

export interface ApprovedReportResult {
	flow: (ApplyOutcome & { proposal: FlowProposal; resolvedAgainst: string }) | null;
	warning: string | null;
}

/**
 * El estado de la OT en `at`, reconstruido de `ot_status_history`.
 *
 * El último movimiento hasta `at` dice dónde estaba; si no hay ninguno, el
 * `from_status` del primero posterior; si no hay historial, el estado actual
 * (la OT no se movió desde entonces, o se movió por un camino que no deja
 * rastro — en ese caso el comportamiento es el de antes).
 */
export async function statusAt(otId: string, at: string | null | undefined, current: string): Promise<string> {
	if (!at) return current;

	const [before, after] = await Promise.all([
		supabaseAdmin.from('ot_status_history').select('to_status')
			.eq('ot_id', otId).lte('created_at', at)
			.order('created_at', { ascending: false }).limit(1).maybeSingle(),
		supabaseAdmin.from('ot_status_history').select('from_status')
			.eq('ot_id', otId).gt('created_at', at)
			.order('created_at', { ascending: true }).limit(1).maybeSingle(),
	]);

	if (before.data?.to_status) return before.data.to_status;
	if (after.data?.from_status) return after.data.from_status;
	return current;
}

export async function applyApprovedProductionReport(
	report: ApprovedReport,
	actor: ApplyActor,
): Promise<ApprovedReportResult> {
	const { data: ot, error: otErr } = await supabaseAdmin
		.from('ots').select('status').eq('id', report.otId).maybeSingle();

	if (otErr) return { flow: null, warning: `No se pudo leer la OT para aplicar el parte: ${otErr.message}` };
	if (!ot) return { flow: null, warning: null };

	const resolvedAgainst = await statusAt(report.otId, report.messageTimestamp, ot.status);

	// La ruta y los pliegos de ESTA OT: resuelven la bifurcación (offset o
	// digital) y dicen si el parte es la etapa entera o una parte.
	const basis = await loadOTBasis(report.otId, resolvedAgainst);

	const proposal = resolveFlow(
		resolvedAgainst,
		{
			...report.parsed,
			message_type: report.eventType ?? undefined,
			// El supervisor que aprueba ya revisó el parte: su decisión pesa más que
			// la confianza que el parser le puso al texto.
			confidence: 100,
		},
		basis?.ctx ?? {},
	);
	const outcome = await applyFlowProposal(report.otId, proposal, actor, {
		// Quién mandó el parte y cuándo: el que escribe «ajuste 40» es quien
		// ajustó, y el mensaje —no la aprobación— fecha el trabajo.
		operatorEmployeeId: report.operatorEmployeeId ?? null,
		messageTimestamp: report.messageTimestamp ?? null,
	});

	return {
		flow: { ...outcome, proposal, resolvedAgainst },
		warning: outcome.blocked ? `Horas registradas, pero la OT no avanzó: ${outcome.blocked}` : null,
	};
}


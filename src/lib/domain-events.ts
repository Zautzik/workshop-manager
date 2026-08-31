import { supabaseAdmin } from '@/integrations/supabase/server';
import type { AppRole } from '@/types/app-role';
import type { Database } from '@/integrations/supabase/types';

/**
 * La bitácora única de "esto pasó", y quién reacciona a partir de ella.
 *
 * Antes de esto, avisar a supervisión cuando una OT llega a un hito vivía
 * como un bloque inline en `/transition` — y sólo ahí. `/split`, el visto
 * bueno del portal y el cierre masivo cambian `ots.status` cada uno por su
 * cuenta y ninguno tenía ese bloque, así que una OT que llegaba a "completada"
 * por esos caminos no avisaba a nadie. No por decisión: por omisión.
 *
 * `emitDomainEvent` registra qué pasó. `dispatchNotifications` decide quién se
 * entera, leyendo `NOTIFICATION_RULES` en vez de que cada ruta reimplemente la
 * misma pregunta. Sigue siendo síncrono dentro del mismo request — no hay acá
 * una cola ni un worker aparte; agregar uno es una decisión operativa más
 * grande de lo que esta pasada resuelve. Lo que sí se gana es que las CUATRO
 * rutas que mueven una OT puedan compartir la misma respuesta a "¿esto es un
 * hito?" en vez de reimplementarla o —como pasaba— no implementarla.
 */

export type DomainEventType = 'ot.status_changed';

export interface DomainEvent {
	type: DomainEventType;
	otId: string;
	payload: Record<string, unknown>;
	actorId: string | null;
	actorRole: AppRole | null;
}

export interface EmittedDomainEvent extends DomainEvent {
	id: string;
}

/**
 * Registra el evento. Best-effort, como `ot_status_history`: si esto falla no
 * se deshace la operación que lo disparó — la fuente de verdad es `ots.status`
 * (o lo que haya cambiado); esto es el rastro, no el dueño del dato.
 */
export async function emitDomainEvent(event: DomainEvent): Promise<EmittedDomainEvent | null> {
	const { data, error } = await supabaseAdmin
		.from('domain_events')
		.insert({
			event_type: event.type,
			ot_id: event.otId,
			payload: event.payload as never,
			actor_id: event.actorId,
			actor_role: event.actorRole,
		})
		.select('id')
		.single();

	if (error) {
		console.error('Error emitting domain event:', error);
		return null;
	}
	return { ...event, id: data.id };
}

type AppRoleDb = Database['public']['Enums']['app_role'];

interface NotificationRule {
	roles: AppRoleDb[];
	title: string;
	message: string;
}

const MILESTONE_STATUSES = new Set(['ready_for_delivery', 'completed']);

/**
 * Qué evento produce qué notificación, y para quién. Un lugar, no cuatro.
 * Devuelve `null` cuando el evento no es de los que avisan — la mayoría de los
 * movimientos de planta no lo son (2026-07 audit: ~20 pings por OT por día
 * antes de acotar esto a los hitos).
 */
function ruleFor(event: DomainEvent): NotificationRule | null {
	if (event.type === 'ot.status_changed') {
		const toStatus = String(event.payload.to_status ?? '');
		if (!MILESTONE_STATUSES.has(toStatus)) return null;
		const statusLabel = toStatus === 'completed' ? 'completada' : 'lista para despacho';
		const otNumber = event.payload.ot_number ?? '';
		const actorName = event.payload.actor_name ?? 'el sistema';
		return {
			roles: ['admin', 'supervisor', 'manager'],
			title: `OT ${otNumber} ${statusLabel}`,
			message: `Cambiada por ${actorName}`,
		};
	}
	return null;
}

/**
 * Notifica a quien corresponda según el evento ya emitido. Best-effort: una
 * OT que avanzó pero no pudo notificar sigue habiendo avanzado.
 */
export async function dispatchNotifications(event: EmittedDomainEvent): Promise<void> {
	const rule = ruleFor(event);
	if (!rule) return;

	const { data: candidateUsers, error: candidatesError } = await supabaseAdmin
		.from('user_roles')
		.select('user_id, role')
		.in('role', rule.roles)
		.neq('user_id', event.actorId ?? '')
		.limit(20);

	if (candidatesError) {
		console.error('Error fetching notification candidates:', candidatesError);
		return;
	}
	if (!candidateUsers || candidateUsers.length === 0) return;

	const notifications = candidateUsers.map((row: { user_id: string; role: string }) => ({
		user_id: row.user_id,
		type: 'ot_status_changed' as const,
		title: rule.title,
		message: rule.message,
		resource_type: 'ot',
		resource_id: event.otId,
		metadata: event.payload as never,
	}));

	const { error } = await supabaseAdmin.from('notifications').insert(notifications);
	if (error) console.error('Error creating notifications:', error);
}

/**
 * @fileoverview Aviso de pauta vencida — un lugar que decide a quién avisar.
 *
 * Mismo espíritu que domain-events.ts ya resolvió para las OTs ("un bloque
 * inline en una sola ruta" → "un lugar, cuatro rutas lo comparten"), pero
 * separado de esa bitácora a propósito: `domain_events.ot_id` tiene un FK
 * real a `public.ots` (ver 20260901110000_domain_events_como_bitacora.sql).
 * Una orden de mantención no es una OT — forzarla ahí exigía romper esa
 * constraint o insertar un id que la FK rechazaría. Este módulo nuevo y
 * chico evita las dos cosas.
 *
 * Dos canales, una sola decisión de "quién":
 *  - `notifications` (in-app, campanita) — admin/supervisor/manager ya la
 *    usan para OTs; se reutiliza la misma tabla, ya genérica en
 *    resource_type/resource_id.
 *  - WhatsApp — el único canal que un técnico de verdad ve (ver el
 *    comentario en landingRouteForRole, navigation.ts: "su único
 *    contacto").
 *
 * Targeting: se le avisa a TODOS los `technician` con teléfono en su ficha,
 * no a un subconjunto "competente en esta máquina" — machine-competency.ts
 * es sobre quién puede OPERAR una máquina en producción, una habilidad
 * distinta de quién puede repararla, y no hay un dato equivalente para
 * mantención. Reusar esa tabla habría sido una señal engañosa, no una real.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp-send';
import logger from '@/lib/logger';

export interface DueScheduleNotice {
  scheduleId: string;
  workOrderId: string;
  machineName: string;
  /** DueResult.reason (maintenance-due.ts) — ya en español, ya armado. */
  reason: string;
}

/** Código corto para que la respuesta de WhatsApp identifique la orden sin ambigüedad. */
export function shortOrderCode(workOrderId: string): string {
  return workOrderId.slice(0, 8).toUpperCase();
}

function buildMessage(notice: DueScheduleNotice): string {
  const code = shortOrderCode(notice.workOrderId);
  // La palabra "PAUTA" es parte del formato, no adorno: whatsapp-maintenance-parser.ts
  // sólo reconoce este canal si el mensaje la trae junto al código -- sin
  // eso, un número de 8 cifras cualquiera (una fecha, un folio) en un chat
  // de producción normal se colaría por error a este pipeline.
  return `🔧 Pauta vencida: ${notice.machineName}. ${notice.reason}\nResponde "PAUTA ${code} LISTO" cuando termines, o cuéntanos qué pasó.`;
}

/**
 * Notifica que una pauta venció. Best-effort en los dos canales -- igual
 * que dispatchNotifications con las OTs, un aviso que falla no deshace que
 * la orden ya se creó (eso es responsabilidad de quien llama, no de esto).
 */
export async function notifyScheduleDue(notice: DueScheduleNotice): Promise<void> {
  const body = buildMessage(notice);

  // ── Canal 1: in-app, para quien ya mira la campanita ──────────────
  const { data: managers, error: mgrError } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .in('role', ['admin', 'supervisor', 'manager']);

  if (mgrError) {
    logger.error({ err: mgrError }, 'No se pudo listar destinatarios in-app de pauta vencida');
  } else if (managers && managers.length > 0) {
    const rows = managers.map((m) => ({
      user_id: m.user_id,
      type: 'maintenance_schedule_due' as const,
      title: `Pauta vencida: ${notice.machineName}`,
      message: notice.reason,
      resource_type: 'maintenance_work_order',
      resource_id: notice.workOrderId,
      metadata: { schedule_id: notice.scheduleId, code: shortOrderCode(notice.workOrderId) } as never,
    }));
    const { error } = await supabaseAdmin.from('notifications').insert(rows);
    if (error) logger.error({ err: error }, 'No se pudieron crear notificaciones in-app de pauta vencida');
  }

  // ── Canal 2: WhatsApp -- el único que un técnico de verdad ve ──────
  const { data: technicianRoles, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'technician');

  if (roleError) {
    logger.error({ err: roleError }, 'No se pudo listar técnicos para avisar por WhatsApp');
    return;
  }
  const technicianUserIds = (technicianRoles ?? []).map((r) => r.user_id);
  if (technicianUserIds.length === 0) return;

  // employees.user_id y user_roles.user_id apuntan los dos a auth.users --
  // no hay una relación directa employees↔user_roles que PostgREST pueda
  // embeber, de ahí las dos consultas en vez de un solo select anidado.
  const { data: technicians, error: empError } = await supabaseAdmin
    .from('employees')
    .select('id, phone')
    .in('user_id', technicianUserIds)
    .not('phone', 'is', null);

  if (empError) {
    logger.error({ err: empError }, 'No se pudo listar teléfonos de técnicos');
    return;
  }

  for (const tech of technicians ?? []) {
    if (!tech.phone) continue;
    await sendWhatsAppMessage(tech.phone, body, `maintenance_schedule_due:${notice.workOrderId}`);
  }
}

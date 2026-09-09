/**
 * @fileoverview WhatsApp Maintenance Ingest — un técnico responde por WhatsApp.
 *
 * Sibling de whatsapp-ingest.ts, no una edición de ese archivo: la pauta que
 * lo justifica (ver el header de whatsapp-maintenance-parser.ts) es que los
 * dos dominios comparten vocabulario y necesitan quedar separados por
 * construcción, no por confianza en un clasificador.
 *
 * `tryProcessMaintenanceMessage` es el único punto de entrada. Devuelve
 * `null` cuando el mensaje no trae un código de mantención -- la señal para
 * que quien llama (processMessage en whatsapp-ingest.ts) siga con el
 * pipeline de producción exactamente como antes.
 *
 * El cierre de la orden pasa por `applyWorkOrderUpdate` (la misma función
 * que usa el PATCH de /api/maintenance/work-orders/[id]), no por un UPDATE
 * paralelo -- así el avance de la pauta vencida (advanceLinkedSchedule) y el
 * registro de downtime (syncDowntime) pasan igual sin importar el canal.
 *
 * A diferencia de ese PATCH (protegido por requireAuth), este camino no
 * tiene sesión -- por eso identifica al remitente por teléfono
 * (findEmployeeByPhone) antes de aplicar cualquier cambio, y se niega en
 * seco si el número no es de un empleado conocido. Cerrar una orden acá es
 * inmediato y sin cola de revisión (a diferencia de producción, que sí tiene
 * un umbral de confianza -- CONFIANZA_PARA_APLICAR_SOLO en whatsapp-flow.ts),
 * así que la identidad del remitente es la única guarda que queda.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { extractMaintenanceCode, classifyMaintenanceReply } from '@/lib/whatsapp-maintenance-parser';
import { applyWorkOrderUpdate } from '@/app/api/maintenance/work-orders/[id]/route';
import { findEmployeeByPhone } from '@/lib/whatsapp-ingest';
import logger from '@/lib/logger';
import type { ProcessResult } from '@/lib/whatsapp-ingest';

interface CompletedItemDraft {
  item_id: string;
  title?: string;
  description?: string;
  estimated_minutes?: number | null;
  completed: boolean;
  completed_at?: string | null;
  notes?: string | null;
}

/**
 * Misma normalización defensiva que deriveItems() en OrdenesPanel.tsx (los
 * ítems reales conviven en al menos dos formas), reescrita acá en vez de
 * importada: ese archivo es un componente de UI, éste es lógica de server.
 */
function deriveCompletedItems(order: {
  completed_items: unknown;
  maintenance_checklists: { items: unknown } | null;
}): CompletedItemDraft[] {
  if (Array.isArray(order.completed_items) && order.completed_items.length > 0) {
    return order.completed_items as CompletedItemDraft[];
  }
  const checklistItems = order.maintenance_checklists?.items;
  if (!Array.isArray(checklistItems)) return [];
  return checklistItems.map((raw: any, i: number) => ({
    item_id: raw.id ?? `item-${raw.order ?? i}`,
    title: raw.title ?? raw.description ?? `Paso ${i + 1}`,
    description: raw.title ? raw.description : undefined,
    estimated_minutes: raw.estimatedTime ?? raw.estimated_minutes ?? null,
    completed: false,
  }));
}

interface MaintenanceMessageInput {
  from: string;
  body: string;
  messageTimestamp: string;
}

export async function tryProcessMaintenanceMessage(
  input: MaintenanceMessageInput,
): Promise<ProcessResult | null> {
  const code = extractMaintenanceCode(input.body);
  if (!code) return null;

  // A diferencia de producción (donde un remitente no identificado igual se
  // procesa, porque cada evento pasa por un umbral de confianza antes de
  // aplicarse de verdad -- ver CONFIANZA_PARA_APLICAR_SOLO en
  // whatsapp-flow.ts), cerrar una orden de mantención es inmediato y sin
  // revisión posterior. Sin este filtro, cualquier número que adivinara o
  // reenviara el código de 8 hex podía cerrar la orden de otra persona. Acá
  // sí es obligatorio identificar a quien escribe -- cualquier empleado
  // conocido, no sólo técnicos: un supervisor que hizo la reparación él
  // mismo también puede cerrarla.
  const employee = await findEmployeeByPhone(input.from);
  if (!employee) {
    logger.warn({ from: input.from }, 'Respuesta de mantención de un número no identificado, ignorada');
    return {
      status: 200,
      payload: {
        status: 'unidentified',
        message: 'No reconozco este número en la ficha de empleados. Pídele a un supervisor que lo registre antes de responder pautas.',
      },
    };
  }

  const { data: openOrders, error } = await supabaseAdmin
    .from('maintenance_work_orders')
    .select('id, machine_id, notes, completed_items, machines(name), maintenance_checklists(items)')
    .in('status', ['pending', 'in_progress']);

  if (error) {
    logger.error({ err: error }, 'No se pudieron cargar órdenes abiertas para responder por WhatsApp');
    return {
      status: 200,
      payload: { status: 'error', message: 'No se pudo verificar el código, intenta de nuevo en un rato.' },
    };
  }

  const order = (openOrders ?? []).find((o) => o.id.slice(0, 8).toUpperCase() === code);
  if (!order) {
    return {
      status: 200,
      payload: {
        status: 'not_found',
        message: `❓ No encontré ninguna orden abierta con el código ${code}. Revisa el mensaje del aviso.`,
      },
    };
  }

  const machine = order.machines as { name: string } | null;
  const outcome = classifyMaintenanceReply(input.body);

  if (outcome === 'problema') {
    // Se queda abierta a propósito: un "no pude, falta repuesto" no cierra
    // nada, sólo dice por qué no -- Órdenes ya la muestra como pendiente,
    // esto sólo deja la nota para quien la revise.
    //
    // Se AGREGA a las notas existentes, no las reemplaza -- un segundo
    // "sigue sin repuesto" no debe borrar el primer reporte, ni las notas
    // que ya tuviera la orden desde que se creó.
    const stamp = `[WhatsApp, ${employee.full_name}] ${input.body}`;
    const newNotes = order.notes ? `${order.notes}\n${stamp}` : stamp;
    const { error: noteError } = await supabaseAdmin
      .from('maintenance_work_orders')
      .update({ notes: newNotes })
      .eq('id', order.id);
    if (noteError) {
      logger.error({ err: noteError }, 'No se pudo guardar la nota de problema reportado por WhatsApp');
    }
    return {
      status: 200,
      payload: {
        status: 'ok',
        type: 'maintenance_problem',
        order_id: order.id,
        message: `📝 Anotado. Un supervisor va a revisar la orden de ${machine?.name ?? 'la máquina'}.`,
      },
    };
  }

  const completedItems = deriveCompletedItems(order).map((item) => ({
    ...item,
    completed: true,
    completed_at: input.messageTimestamp,
    completed_by: employee.id,
  }));
  const totalMinutes = completedItems.reduce((sum, it) => sum + (it.estimated_minutes ?? 0), 0);

  const { error: updateError } = await applyWorkOrderUpdate(order.id, {
    status: 'completed',
    completed_at: input.messageTimestamp,
    total_time_minutes: totalMinutes || undefined,
    completed_items: completedItems,
  });

  if (updateError) {
    logger.error({ err: updateError, orderId: order.id }, 'No se pudo cerrar la orden desde WhatsApp');
    return {
      status: 200,
      payload: { status: 'error', message: 'No se pudo cerrar la orden, avísale a un supervisor.' },
    };
  }

  return {
    status: 200,
    payload: {
      status: 'ok',
      type: 'maintenance_completed',
      order_id: order.id,
      message: `✅ Orden cerrada: ${machine?.name ?? 'máquina'}. Gracias.`,
    },
  };
}

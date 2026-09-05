import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { advanceSchedule } from '@/lib/maintenance-due';

export const dynamic = 'force-dynamic';

/**
 * Maintenance work-order execution: start / complete, and the checklist
 * snapshot ticked along the way.
 *
 * These were browser-direct from WorkOrderExecution, so under dev-bypass a
 * technician could tick every task and finish the order while nothing
 * persisted. Now server-side, and `completed_items` replaces the old
 * `maintenance_task_completions` FK path entirely: that table's `task_id`
 * pointed at `maintenance_tasks`, a table nothing in the app ever inserted
 * into, so the FK could never be satisfied and the per-task POST below could
 * never succeed even before dev-bypass — dead from two directions at once.
 * `completed_items` is a snapshot on the order itself instead of a live join,
 * so editing a checklist later can't retroactively change what an
 * already-completed order appears to have required.
 */
const CompletedItemSchema = z.object({
  item_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  estimated_minutes: z.number().nullable().optional(),
  completed: z.boolean(),
  completed_at: z.string().nullable().optional(),
  completed_by: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateWorkOrderSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  total_time_minutes: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Reemplaza el arreglo completo -- el cliente manda su copia local entera en cada tick. */
  completed_items: z.array(CompletedItemSchema).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH — update the work order itself (start, complete, annotate, ticks). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de orden válido' }, { status: 400 });
  }

  try {
    const parsed = UpdateWorkOrderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la orden', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_work_orders')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Downtime is captured from the act of working, not from a second form —
    // same principle as the QR clock. `machine_downtime_logs` existed with zero
    // readers and zero writers, so availability/OEE had no raw material at all.
    await syncDowntime(data, parsed.data.status);

    // Si esta orden nació de una pauta, completarla avanza su reloj -- si no,
    // la pauta se queda vencida para siempre aunque el trabajo ya se hizo.
    if (parsed.data.status === 'completed') {
      await advanceLinkedSchedule(data);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la orden de trabajo' }, { status: 500 });
  }
}

/**
 * Opens a downtime row when a work order starts and closes it when the order
 * completes. Best-effort and idempotent-ish: a machine has at most one open row,
 * and a failure here must never block the technician's actual work.
 */
async function syncDowntime(
  order: { id: string; machine_id: string; started_at: string | null; completed_at: string | null },
  newStatus?: string
) {
  if (!newStatus || !order?.machine_id) return;

  try {
    const reason = `Orden de mantención ${order.id.slice(0, 8)}`;

    if (newStatus === 'in_progress') {
      const { data: existing } = await supabaseAdmin
        .from('machine_downtime_logs')
        .select('id')
        .eq('machine_id', order.machine_id)
        .is('end_time', null)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from('machine_downtime_logs').insert({
          machine_id: order.machine_id,
          reason,
          start_time: order.started_at ?? new Date().toISOString(),
          impact_description: 'Máquina fuera de servicio por mantención',
        });
      }
      return;
    }

    if (newStatus === 'completed' || newStatus === 'cancelled') {
      const { data: open } = await supabaseAdmin
        .from('machine_downtime_logs')
        .select('id, start_time')
        .eq('machine_id', order.machine_id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (open) {
        const end = order.completed_at ?? new Date().toISOString();
        const hours =
          (new Date(end).getTime() - new Date(open.start_time).getTime()) / 3_600_000;
        await supabaseAdmin
          .from('machine_downtime_logs')
          .update({
            end_time: end,
            duration_hours: Math.max(0, Math.round(hours * 100) / 100),
          })
          .eq('id', open.id);
      }
    }
  } catch (err) {
    // Loud in the log, invisible to the technician: losing a downtime row is a
    // reporting gap, not a reason to fail closing the work order.
    console.error('Downtime sync failed for work order', order.id, err);
  }
}

/**
 * Avanza el reloj de la pauta que generó esta orden (ver advanceSchedule en
 * maintenance-due.ts). Mismo cuidado que syncDowntime: best-effort, nunca
 * bloquea el cierre real de la orden por un problema acá.
 */
async function advanceLinkedSchedule(order: {
  schedule_id: string | null;
  machine_id: string;
  completed_at: string | null;
}) {
  if (!order.schedule_id) return;

  try {
    const [{ data: schedule }, { data: machine }] = await Promise.all([
      supabaseAdmin
        .from('maintenance_schedules')
        .select('frequency_days')
        .eq('id', order.schedule_id)
        .maybeSingle(),
      supabaseAdmin
        .from('machines')
        .select('usage_counter')
        .eq('id', order.machine_id)
        .maybeSingle(),
    ]);

    if (!schedule) return;

    const patch = advanceSchedule({
      frequencyDays: schedule.frequency_days,
      completedAt: order.completed_at ? new Date(order.completed_at) : new Date(),
      usageAtCompletion: machine?.usage_counter ?? null,
    });

    await supabaseAdmin.from('maintenance_schedules').update(patch).eq('id', order.schedule_id);
  } catch (err) {
    console.error('No se pudo avanzar la pauta de la orden', order, err);
  }
}

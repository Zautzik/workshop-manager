import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Maintenance work-order execution: start / complete, and per-task ticks.
 * These were browser-direct from WorkOrderExecution, so under dev-bypass a
 * technician could tick every task and finish the order while nothing persisted.
 */
const UpdateWorkOrderSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  total_time_minutes: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const TaskCompletionSchema = z.object({
  completion_id: z.string().uuid(),
  completed: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH — update the work order itself (start, complete, annotate). */
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

/** POST — tick or untick one task of this work order. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de orden válido' }, { status: 400 });
  }

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const parsed = TaskCompletionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la tarea', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { completion_id, completed, notes } = parsed.data;
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('maintenance_task_completions')
      .update({
        completed,
        completed_at: completed ? now : null,
        completed_by: completed ? userId : null,
        notes: notes ?? null,
      })
      .eq('id', completion_id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar la tarea' }, { status: 500 });
  }
}

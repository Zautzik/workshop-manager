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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la orden de trabajo' }, { status: 500 });
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

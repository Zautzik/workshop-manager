import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { manualEditPatch, rememberRemovedRotationRows } from '@/lib/rotation-skips';

export const dynamic = 'force-dynamic';

// Igual que en la ruta de creación: `workstation_id` se sigue aceptando porque
// es el vocabulario del piso, pero desde la fusión ese puesto ES la máquina y el
// valor termina en `machine_id`.
const UpdateAssignmentSchema = z
  .object({
    employee_id: z.string().uuid().optional(),
    workstation_id: z.string().uuid().optional(),
    machine_id: z.string().uuid().optional(),
    role: z.string().min(1).optional(),
    ot_id: z.string().uuid().nullable().optional(),
  })
  .transform(({ workstation_id, ...rest }) => {
    const machine_id = rest.machine_id ?? workstation_id;
    return machine_id ? { ...rest, machine_id } : rest;
  });

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = UpdateAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Editar un turno de rotación lo vuelve manual, y si cambia la persona, la
    // original queda "saltada" ese día: regenerar no deshace el cambio.
    const { data: before, error: beforeErr } = await supabaseAdmin.from('worker_assignments').select('*').eq('id', id).maybeSingle();
    if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
    if (before && parsed.data.employee_id && parsed.data.employee_id !== before.employee_id) {
      await rememberRemovedRotationRows([before as any]);
    }

    const { data, error } = await supabaseAdmin
      .from('worker_assignments')
      .update({ ...parsed.data, ...(before ? manualEditPatch(before as any) : {}) } as never)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
  }

  const { data: removed, error } = await supabaseAdmin
    .from('worker_assignments')
    .delete()
    .eq('id', id)
    .select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Quitar a alguien de un turno de rotación: regenerar no lo vuelve a poner.
  await rememberRemovedRotationRows((removed ?? []) as any[]);

  return NextResponse.json({ ok: true });
}

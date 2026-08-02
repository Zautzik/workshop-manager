import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

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

    const { data, error } = await supabaseAdmin
      .from('worker_assignments')
      .update(parsed.data)
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

  const { error } = await supabaseAdmin
    .from('worker_assignments')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

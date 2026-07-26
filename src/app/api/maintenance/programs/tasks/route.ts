import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/** Tasks belonging to a maintenance program, and the weekly tick log. */
const TaskSchema = z.object({
  program_id: z.string().uuid(),
  description: z.string().min(1).max(1000),
  action_type: z.enum([
    'clean', 'lubricate', 'check', 'replace', 'adjust', 'inspect', 'service', 'fill', 'other',
  ]),
  frequency: z.enum([
    'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual',
  ]),
  estimated_minutes: z.coerce.number().min(0).nullable().optional(),
  section: z.string().max(255).nullable().optional(),
  subsection: z.string().max(255).nullable().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  task_number: z.coerce.number().int().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = TaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la tarea', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('program_tasks')
      .insert({ ...parsed.data, is_active: true })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear la tarea' }, { status: 500 });
  }
}

/** PATCH — edit a task, or retire it with `is_active: false` (soft delete). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de tarea válido' }, { status: 400 });
  }

  try {
    const parsed = TaskSchema.partial()
      .extend({ is_active: z.boolean().optional() })
      .safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la tarea', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('program_tasks')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la tarea' }, { status: 500 });
  }
}

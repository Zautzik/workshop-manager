import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const StepSchema = z.object({
  step_order: z.coerce.number().int().min(1).max(99),
  title: z.string().min(3).max(160),
  description: z.string().max(2000).nullable().optional(),
  skill_id: z.string().uuid().nullable().optional(),
  target_proficiency: z.coerce.number().int().min(1).max(5).nullable().optional(),
  estimated_hours: z.coerce.number().min(0).max(2000).nullable().optional(),
  training_article_id: z.string().uuid().nullable().optional(),
  mentor_employee_id: z.string().uuid().nullable().optional(),
  requires_evidence: z.boolean().optional(),
});

/**
 * La ruta para que alguien nuevo llegue a operar esta máquina.
 * Se apoya en `skills` y `training_articles`, que ya existen — un paso no
 * reescribe el material de capacitación, lo apunta.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const employeeId = new URL(req.url).searchParams.get('employee_id');

  // `employees` has no `first_name`/`last_name` — one field, `full_name`.
  // This join always 500'd (2026-08 audit).
  const { data: steps, error } = await supabaseAdmin
    .from('machine_training_paths')
    .select('*, skills ( id, name, code ), training_articles ( id, title, slug ), employees!machine_training_paths_mentor_employee_id_fkey ( id, full_name )')
    .eq('machine_id', id)
    .eq('is_active', true)
    .order('step_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let progress: Record<string, unknown>[] = [];
  if (employeeId && steps?.length) {
    const { data } = await supabaseAdmin
      .from('machine_training_progress')
      .select('*')
      .eq('employee_id', employeeId)
      .in('path_id', steps.map((s) => s.id));
    progress = data ?? [];
  }

  const totalHours = (steps ?? []).reduce((acc, s) => acc + Number(s.estimated_hours ?? 0), 0);

  return NextResponse.json({
    steps: steps ?? [],
    progress,
    total_estimated_hours: totalHours,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const { id: stepId, ...rest } = body ?? {};

    if (stepId) {
      const parsed = StepSchema.partial().safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Paso inválido', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const { data, error } = await supabaseAdmin
        .from('machine_training_paths')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', stepId)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    const parsed = StepSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Paso inválido', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_training_paths')
      .insert({ machine_id: id, ...parsed.data })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el paso' }, { status: 500 });
  }
}

const ProgressSchema = z.object({
  path_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  status: z.enum(['pendiente', 'en_curso', 'completado', 'validado']),
  hours_logged: z.coerce.number().min(0).optional(),
  evidence_url: z.string().url().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Avance de una persona en un paso.
 * `validado` no lo puede poner el propio aprendiz: lo firma quien evalúa. Es la
 * misma regla que ya rige la certificación de una habilidad.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ProgressSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Avance inválido', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (
      parsed.data.status === 'validado' &&
      !(auth.role && ['admin', 'supervisor', 'manager'].includes(auth.role))
    ) {
      return NextResponse.json(
        { error: 'Sólo un supervisor puede validar un paso de formación' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('machine_training_progress')
      .upsert(
        {
          ...parsed.data,
          started_at: parsed.data.status !== 'pendiente' ? now : null,
          completed_at: ['completado', 'validado'].includes(parsed.data.status) ? now : null,
          validated_at: parsed.data.status === 'validado' ? now : null,
          updated_at: now,
        },
        { onConflict: 'path_id,employee_id' }
      )
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar el avance' }, { status: 500 });
  }
}

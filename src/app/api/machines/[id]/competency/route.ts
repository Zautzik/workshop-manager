import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  evaluateOperator,
  machineCoverage,
  type SkillRequirement,
  type HeldSkill,
} from '@/lib/machine-competency';

export const dynamic = 'force-dynamic';

/**
 * GET /api/machines/[id]/competency
 *
 * La pregunta al revés de la que ya existía. `worker-qualifications` respondía
 * "¿puede esta persona operar esta máquina?" — útil, pero sólo si ya sabes a
 * quién preguntar. Acá se responde "¿de cuánta gente depende esta máquina?",
 * que es la que descubre que la hotmelera la sabe correr una sola persona.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  const { data: machine } = await supabaseAdmin
    .from('machines')
    .select('id, name, type, min_qualified_operators')
    .eq('id', id)
    .single();

  if (!machine) return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });

  const [{ data: reqRows }, { data: employees }, { data: paths }] = await Promise.all([
    supabaseAdmin
      .from('machine_skill_requirements')
      .select('skill_id, min_proficiency, is_critical, requires_certification, supervised_hours_required, skills ( id, name, code )')
      .eq('machine_id', id),
    supabaseAdmin
      .from('employees')
      .select('id, full_name, department, status')
      // 'on_leave' cuenta: sigue habilitado, sólo no está hoy. Excluirlo haría
      // que unas vacaciones se vean como una pérdida permanente de cobertura.
      .in('status', ['active', 'on_leave']),
    supabaseAdmin
      .from('machine_training_paths')
      .select('*, skills ( id, name, code ), training_articles ( id, title, slug )')
      .eq('machine_id', id)
      .eq('is_active', true)
      .order('step_order'),
  ]);

  const requirements: SkillRequirement[] = (reqRows ?? []).map((r) => ({
    skill_id: r.skill_id,
    skill_name: (r.skills as { name: string } | null)?.name ?? null,
    min_proficiency: r.min_proficiency,
    is_critical: r.is_critical,
    requires_certification: r.requires_certification,
    supervised_hours_required: r.supervised_hours_required,
  }));

  const employeeIds = (employees ?? []).map((e) => e.id);
  const { data: skillRows } = employeeIds.length
    ? await supabaseAdmin
        .from('employee_skills')
        .select('employee_id, skill_id, proficiency_level, certified, hours_practiced, certification_expires_on')
        .in('employee_id', employeeIds)
    : { data: [] as never[] };

  const skillsByEmployee = new Map<string, HeldSkill[]>();
  for (const s of skillRows ?? []) {
    const list = skillsByEmployee.get(s.employee_id) ?? [];
    list.push({
      skill_id: s.skill_id,
      proficiency_level: s.proficiency_level,
      certified: s.certified,
      hours_practiced: s.hours_practiced,
      certification_expires_on: s.certification_expires_on,
    });
    skillsByEmployee.set(s.employee_id, list);
  }

  const roster = (employees ?? []).map((e) => ({
    employeeId: e.id,
    skills: skillsByEmployee.get(e.id) ?? [],
  }));

  const coverage = machineCoverage(
    requirements,
    roster,
    machine.min_qualified_operators ?? 2
  );

  const byId = new Map((employees ?? []).map((e) => [e.id, e]));

  // Sólo se detalla a quien tiene algo que ver con la máquina: habilitados,
  // en formación, o con al menos una competencia del requisito. Listar a los
  // 40 del taller con "no habilitado" no le sirve a nadie.
  const people = roster
    .map((p) => ({
      employee_id: p.employeeId,
      name: byId.get(p.employeeId)?.full_name ?? '—',
      department: byId.get(p.employeeId)?.department ?? null,
      status: byId.get(p.employeeId)?.status ?? null,
      evaluation: evaluateOperator(requirements, p.skills),
    }))
    .filter((p) => p.evaluation.readiness > 0 || p.evaluation.canOperateSupervised)
    .sort((a, b) => b.evaluation.readiness - a.evaluation.readiness);

  return NextResponse.json({
    machine,
    requirements,
    coverage,
    people,
    training_path: paths ?? [],
  });
}

const RequirementSchema = z.object({
  skill_id: z.string().uuid(),
  min_proficiency: z.coerce.number().int().min(1).max(5),
  is_critical: z.boolean().optional(),
  requires_certification: z.boolean().optional(),
  supervised_hours_required: z.coerce.number().min(0).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

/** Declarar qué exige esta máquina. Sin esto, `can_operate` es una ficción. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const parsed = RequirementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Requisito inválido', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_skill_requirements')
      .upsert(
        { machine_id: id, ...parsed.data, updated_at: new Date().toISOString() },
        { onConflict: 'machine_id,skill_id' }
      )
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el requisito' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const skillId = new URL(req.url).searchParams.get('skill_id');

  if (!skillId || !z.string().uuid().safeParse(skillId).success) {
    return NextResponse.json({ error: 'Se requiere skill_id' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('machine_skill_requirements')
    .delete()
    .eq('machine_id', id)
    .eq('skill_id', skillId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

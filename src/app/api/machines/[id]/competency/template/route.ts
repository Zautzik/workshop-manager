import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { competencyTemplateFor } from '@/lib/machine-competency-templates';

export const dynamic = 'force-dynamic';

/**
 * GET — propuesta de competencias para esta máquina, resuelta contra el
 * catálogo real de `skills`. Lo que la plantilla nombra y el taller no tiene
 * se reporta aparte en vez de desaparecer: si falta una habilidad del catálogo,
 * eso también es información.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  const { data: machine } = await supabaseAdmin
    .from('machines')
    .select('id, name, type')
    .eq('id', id)
    .single();

  if (!machine) return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });

  const plantilla = competencyTemplateFor(machine.type);

  const [{ data: skills }, { data: existing }] = await Promise.all([
    supabaseAdmin.from('skills').select('id, code, name').in('code', plantilla.map((p) => p.skill_code)),
    supabaseAdmin.from('machine_skill_requirements').select('skill_id').eq('machine_id', id),
  ]);

  const byCode = new Map((skills ?? []).map((s) => [s.code, s]));
  const yaExigidas = new Set((existing ?? []).map((r) => r.skill_id));

  const items = plantilla
    .filter((p) => byCode.has(p.skill_code))
    .map((p) => {
      const skill = byCode.get(p.skill_code)!;
      return {
        ...p,
        skill_id: skill.id,
        skill_name: skill.name,
        already_present: yaExigidas.has(skill.id),
      };
    });

  const sinCatalogo = plantilla
    .filter((p) => !byCode.has(p.skill_code))
    .map((p) => p.skill_code);

  return NextResponse.json({
    machine,
    items,
    // No se esconde: si la plantilla pide una competencia que el catálogo no
    // tiene, hay que crearla en Personas antes de poder exigirla.
    missing_from_catalog: sinCatalogo,
  });
}

const ApplySchema = z.object({
  items: z.array(z.object({
    skill_id: z.string().uuid(),
    min_proficiency: z.coerce.number().int().min(1).max(5),
    is_critical: z.boolean(),
    requires_certification: z.boolean().optional(),
    supervised_hours_required: z.coerce.number().min(0).nullable().optional(),
  })).min(1).max(30),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const parsed = ApplySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Plantilla inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_skill_requirements')
      .upsert(
        parsed.data.items.map((i) => ({
          machine_id: id,
          ...i,
          supervised_hours_required: i.supervised_hours_required ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'machine_id,skill_id' }
      )
      .select('skill_id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ applied: data?.length ?? 0 }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo aplicar la plantilla' }, { status: 500 });
  }
}

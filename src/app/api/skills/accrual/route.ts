import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { computeAccrual, type AssignmentHours, type MachineSkillLink } from '@/lib/skill-accrual';

export const dynamic = 'force-dynamic';

/** Junta los datos crudos que la función pura necesita. */
async function cargar() {
  // La asignación ya trae la máquina. Antes había que pasar por `workstations`
  // para traducir puesto → máquina; ese salto desapareció con la fusión.
  const [{ data: asignaciones }, { data: requisitos }, { data: niveles }, { data: actuales }, { data: empleados }] =
    await Promise.all([
      supabaseAdmin.from('worker_assignments').select('employee_id, machine_id, date, hours_worked'),
      supabaseAdmin.from('machine_skill_requirements').select('machine_id, skill_id, skills ( name, skill_tree_type )'),
      supabaseAdmin.from('skill_proficiency_levels').select('skill_id, level, min_hours_required'),
      supabaseAdmin.from('employee_skills').select('employee_id, skill_id, proficiency_level, hours_practiced, certified'),
      supabaseAdmin.from('employees').select('id, full_name, status'),
    ]);

  const assignments: AssignmentHours[] = (asignaciones ?? [])
    .filter((a) => a.employee_id && a.hours_worked)
    .map((a) => ({
      employee_id: a.employee_id as string,
      machine_id: (a.machine_id as string | null) ?? '',
      hours: Number(a.hours_worked),
      date: a.date,
    }))
    .filter((a) => a.machine_id);

  const machineSkills: MachineSkillLink[] = (requisitos ?? []).map((r) => {
    const s = r.skills as { name: string; skill_tree_type: string } | null;
    return {
      machine_id: r.machine_id,
      skill_id: r.skill_id,
      skill_tree_type: s?.skill_tree_type ?? 'technical',
      skill_name: s?.name ?? null,
    };
  });

  return {
    assignments,
    machineSkills,
    levels: (niveles ?? []).map((l) => ({
      skill_id: l.skill_id, level: l.level, min_hours_required: l.min_hours_required,
    })),
    existing: (actuales ?? []).map((e) => ({
      employee_id: e.employee_id, skill_id: e.skill_id,
      proficiency_level: e.proficiency_level, hours_practiced: e.hours_practiced,
      certified: e.certified,
    })),
    employees: empleados ?? [],
  };
}

/**
 * GET /api/skills/accrual
 *
 * Qué dicen las horas reales del taller sobre las competencias de cada persona.
 * No escribe nada: es lo que hay que mirar antes de decidir.
 *
 * El dato existía desde siempre —`worker_assignments` sabe quién estuvo en qué
 * puesto cuántas horas, y cada puesto tiene su máquina— y nadie lo cruzaba con
 * el catálogo de competencias. La matriz se llenaba a mano, que es como no
 * llenarla.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  const { assignments, machineSkills, levels, existing, employees } = await cargar();

  if (machineSkills.length === 0) {
    return NextResponse.json({
      rows: [], summary: { total: 0 },
      blocked_reason:
        'Ninguna máquina tiene competencias declaradas todavía, así que las horas trabajadas no se pueden atribuir a ninguna competencia. Defínelas en Equipos → Mecánica → Quién la opera.',
    });
  }

  const rows = computeAccrual({ assignments, machineSkills, levels, existing });
  const nameById = new Map(employees.map((e) => [e.id, e.full_name]));

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, employee_name: nameById.get(r.employee_id) ?? '—' })),
    summary: {
      total: rows.length,
      con_propuesta: rows.filter((r) => r.hasProposal).length,
      sin_registro: rows.filter((r) => r.isNew).length,
      suben_nivel: rows.filter((r) => r.suggestedLevel > r.currentLevel).length,
      horas_totales: Math.round(rows.reduce((a, r) => a + r.observedHours, 0)),
    },
  });
}

const ApplySchema = z.object({
  /** Qué filas aplicar, como "employee_id|skill_id". Vacío = todas. */
  keys: z.array(z.string()).optional(),
  /**
   * Crear el registro de competencia a quien trabajó la máquina y no lo tiene.
   * Nace en nivel 1 SIN certificar: sólo deja asentado que estuvo ahí.
   */
  create_missing: z.boolean().optional(),
});

/**
 * POST — deja las horas reales en la ficha.
 *
 * ESCRIBE HORAS, NUNCA NIVELES. Trescientas horas en la guillotina no prueban
 * que alguien corte bien: prueban que estuvo ahí. Subir a alguien de nivel lo
 * decide una persona mirando el trabajo, y ese acto ya tiene su lugar en el
 * módulo de competencias. Acá sólo se deja de mentir sobre las horas.
 *
 * Idempotente: fija el total observado en vez de sumar, así que reprocesar no
 * infla las horas de nadie.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ApplySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    const { keys, create_missing = false } = parsed.data;

    const { assignments, machineSkills, levels, existing } = await cargar();
    const rows = computeAccrual({ assignments, machineSkills, levels, existing });

    const seleccion = keys?.length
      ? rows.filter((r) => keys.includes(`${r.employee_id}|${r.skill_id}`))
      : rows.filter((r) => r.hasProposal);

    const actualizar = seleccion.filter((r) => !r.isNew);
    const crear = create_missing ? seleccion.filter((r) => r.isNew) : [];

    let actualizadas = 0;
    for (const r of actualizar) {
      const { error } = await supabaseAdmin
        .from('employee_skills')
        .update({ hours_practiced: r.observedHours, updated_at: new Date().toISOString() })
        .eq('employee_id', r.employee_id)
        .eq('skill_id', r.skill_id);
      if (!error) actualizadas++;
    }

    let creadas = 0;
    if (crear.length) {
      const { data, error } = await supabaseAdmin
        .from('employee_skills')
        .insert(crear.map((r) => ({
          employee_id: r.employee_id,
          skill_id: r.skill_id,
          // Nivel 1 y sin certificar: sólo consta que trabajó en esa máquina.
          // El nivel real lo pone quien evalúa.
          proficiency_level: 1,
          certified: false,
          hours_practiced: r.observedHours,
          source_of_knowledge: 'Detectado desde las horas trabajadas en planta',
          notes: `Creado automáticamente: ${r.observedHours} h reales entre ${r.firstWorked} y ${r.lastWorked}. Falta evaluación.`,
        })))
        .select('id');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      creadas = data?.length ?? 0;
    }

    return NextResponse.json({
      updated: actualizadas,
      created: creadas,
      pending_assessment: seleccion.filter((r) => r.suggestedLevel > r.currentLevel).length,
      message:
        'Se actualizaron las horas reales. Los niveles no se tocaron: subir a alguien lo decide un evaluador mirando el trabajo, no el reloj.',
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la acumulación' }, { status: 500 });
  }
}

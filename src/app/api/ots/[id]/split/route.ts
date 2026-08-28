import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, validateTransition, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { estimatedHoursFor, promptsStageReport } from '@/lib/stage-report';

// El cierre de la etapa que el fragmento deja atrás. Un avance parcial es una
// PASADA propia —se cortaron tres mil hoy y los otros tres mil salen mañana— y
// tiene sus propias horas y su propia merma. Reutilizar el cierre de la pasada
// anterior duplicaría horas que nadie trabajó.
const StageReportSchema = z.object({
  // `null` es válido: la pasada del fragmento queda abierta y se cierra después.
  // El tope acá sólo evita que desborde la columna; el límite real y su
  // explicación viven en `validateStageReport`.
  hours: z.coerce.number().positive().max(999_999).nullable().optional(),
  merma_sheets: z.coerce.number().int().min(0).optional().nullable(),
  waste_notes: z.string().max(2000).optional().nullable(),
  issues: z.string().max(2000).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
});

const SplitSchema = z.object({
  advance_quantity: z.number().positive(),
  target_status: z.string().min(1),
  stage_report: StageReportSchema.optional().nullable(),
});

// POST /api/ots/[id]/split
// Splits a portion of an OT into a new fragment that advances to target_status.
// The fragment must obey the same workflow rules as a normal transition
// (forward-only, role, approval/cost gates); the two writes are performed
// atomically by the split_ot() Postgres function.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const rl = enforceRouteRateLimit({
    req: request,
    key: `ots:${buildRateLimitActor(request, auth.id)}:split`,
    limit: 20,
    windowMs: 60_000,
    message: 'Too many OT split requests. Please wait before retrying.',
  });
  if (rl) return rl;

  const { id: otId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = SplitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { advance_quantity, target_status, stage_report } = parsed.data;

  if (!isValidStatus(target_status)) {
    return NextResponse.json({ error: 'Estado destino inválido.' }, { status: 400 });
  }
  const toStatus = target_status as OTWorkflowStatus;

  // Fetch the parent's current status (the transition source).
  const { data: ot, error: otErr } = await supabaseAdmin
    .from('ots')
    // `calc_*` y la máquina no se usan para partir la OT: son el contexto
    // contra el que se juzga el cierre de la etapa y el destino de sus horas.
    .select('id, status, assigned_machine_id, calc_sheets, calc_print_hours, calc_finish_hours')
    .eq('id', otId)
    .single();

  if (otErr || !ot) {
    return NextResponse.json({ error: 'OT not found' }, { status: 404 });
  }

  if (!isValidStatus(ot.status)) {
    return NextResponse.json({ error: 'OT tiene un estado actual inválido.' }, { status: 409 });
  }

  // The fragment advances forward from the parent's status — enforce the same
  // workflow rules (role access, forward-only, approval + real-cost gates).
  const [approvalResult, costsResult, openPassesResult] = await Promise.all([
    supabaseAdmin
      .from('ot_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('ot_id', otId)
      .eq('status', 'approved'),
    supabaseAdmin
      .from('ot_real_costs')
      .select('id', { count: 'exact', head: true })
      .eq('ot_id', otId),
    supabaseAdmin
      .from('ot_stage_reports')
      .select('workflow_step, created_at')
      .eq('ot_id', otId)
      .is('hours', null),
  ]);

  const fromStatus = ot.status as OTWorkflowStatus;

  const check = validateTransition({
    fromStatus,
    toStatus,
    role: auth.role!,
    hasApprovedApproval: (approvalResult.count ?? 0) > 0,
    hasAnyRealCosts: (costsResult.count ?? 0) > 0,
    stageReport: stage_report
      ? {
          hours: stage_report.hours ?? null,
          mermaSheets: stage_report.merma_sheets ?? null,
          wasteNotes: stage_report.waste_notes ?? null,
          issues: stage_report.issues ?? null,
          observations: stage_report.observations ?? null,
        }
      : null,
    stageReportContext: {
      // Los pliegos del trabajo ENTERO. El fragmento se llevó una parte, pero
      // la merma de esta pasada se juzga contra el tiraje al que pertenece: un
      // 8% es el arreglo en 500 pliegos y una máquina con problemas en 100.000.
      enteredSheets: ot.calc_sheets ?? null,
      estimatedHours: estimatedHoursFor(fromStatus, ot),
    },
    openPasses:
      (openPassesResult.data as { workflow_step: string; created_at: string }[] | null) ?? undefined,
  });

  if (!check.ok) {
    return NextResponse.json({ error: check.message ?? 'Transición no permitida.', code: check.code }, { status: 400 });
  }

  // Atomic split: shrink parent + insert fragment in a single transaction.
  // Quantity and label-collision guards live inside the function and surface
  // here as PostgREST errors.
  const { data, error } = await supabaseAdmin.rpc('split_ot', {
    p_ot_id: otId,
    p_advance_quantity: advance_quantity,
    p_target_status: toStatus,
  });

  if (error) {
    console.error('Error splitting OT:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // El cierre se escribe contra la OT PADRE, que es la que estuvo en la
  // máquina. El fragmento nace ya en la etapa siguiente: colgarle a él las
  // horas de un trabajo que hizo su padre rompería la lectura de la historia.
  // Después del `split_ot` y no antes, por lo mismo que en la transición: si el
  // reparto falla, no queda un cierre hablando de una pasada que no ocurrió.
  let stageReportWarning: string | null = null;
  if (promptsStageReport(fromStatus)) {
    const { error: reportError } = await supabaseAdmin.from('ot_stage_reports').insert({
      ot_id: otId,
      workflow_step: fromStatus,
      to_status: toStatus,
      hours: stage_report?.hours ?? null,
      units_moved: Math.round(advance_quantity),
      merma_sheets: stage_report?.merma_sheets ?? null,
      waste_notes: stage_report?.waste_notes?.trim() || null,
      issues: stage_report?.issues?.trim() || null,
      observations: stage_report?.observations?.trim() || null,
      machine_id: ot.assigned_machine_id ?? null,
      recorded_by: auth.id,
    });
    if (reportError) {
      console.error('Error writing OT stage report on split:', reportError);
      stageReportWarning =
        'La OT se dividió y avanzó, pero la pasada por la etapa no quedó registrada. Avisá para que se cargue a mano.';
    }
  }

  // `split_ot` devuelve un objeto `{ original, split }`: el aviso se agrega como
  // una clave más para no cambiarle la forma a quien ya lee la respuesta.
  return NextResponse.json(
    stageReportWarning
      ? { ...(data as Record<string, unknown>), warning: stageReportWarning }
      : data,
  );
}

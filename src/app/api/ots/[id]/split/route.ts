import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { moveOT } from '@/lib/ot-move';
import { PaperIssueSchema, toPaperIssueLines } from '@/lib/paper-issue-schema';

// El cierre de la etapa que el fragmento deja atrás. Un avance parcial es una
// PASADA propia —se cortaron tres mil hoy y los otros tres mil salen mañana— y
// tiene sus propias horas y su propia merma.
const StageReportSchema = z.object({
  // `null` es válido: la pasada del fragmento queda abierta y se cierra después.
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
  // El papel del fragmento, si entra a la primera etapa de la ruta.
  paper_issue: PaperIssueSchema,
});

// POST /api/ots/[id]/split
// Avance parcial: una parte de la OT pasa a `target_status` y el resto se queda.
// Es el mismo movimiento que una transición (`moveOT`, src/lib/ot-move.ts) —
// mismas compuertas, misma pasada, misma salida de papel, mismo aviso—; sólo cambia
// que avanza un fragmento (`split_ot`, atómico en la base).
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
  const parsed = SplitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }
  const { advance_quantity, target_status, stage_report, paper_issue } = parsed.data;
  if (!isValidStatus(target_status)) {
    return NextResponse.json({ error: 'Estado destino inválido.' }, { status: 400 });
  }

  const result = await moveOT({
    otId,
    toStatus: target_status as OTWorkflowStatus,
    partialQuantity: advance_quantity,
    paperIssue: toPaperIssueLines(paper_issue),
    actor: { id: auth.id, role: auth.role!, name: auth.name ?? auth.email },
    stageReport: stage_report
      ? {
          hours: stage_report.hours ?? null,
          mermaSheets: stage_report.merma_sheets ?? null,
          wasteNotes: stage_report.waste_notes ?? null,
          issues: stage_report.issues ?? null,
          observations: stage_report.observations ?? null,
        }
      : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  // `split_ot` devuelve `{ original, split }`: el aviso va como una clave más
  // para no cambiarle la forma a quien ya lee la respuesta.
  const data = result.split ?? {};
  return NextResponse.json(result.warnings.length > 0 ? { ...data, warning: result.warnings.join(' ') } : data);
}

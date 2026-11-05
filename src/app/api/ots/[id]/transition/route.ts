import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { moveOT } from '@/lib/ot-move';

/**
 * El cierre de la etapa que termina. Viaja CON la transición y no por una ruta
 * aparte a propósito: si fueran dos llamadas, la que falla deja al taller con
 * una OT movida y sin horas —o con horas de una etapa que nunca se cerró—, que
 * es exactamente el estado que este registro viene a evitar.
 */
const StageReportSchema = z.object({
  // `null` es una respuesta válida: la pasada queda abierta y alguien la cierra
  // después. El tope acá es sólo para que no entre un número que desborde la
  // columna; el límite real —y el mensaje que explica que 480 son minutos, no
  // horas— vive en `validateStageReport`.
  hours: z.coerce.number().positive().max(999_999).nullable().optional(),
  merma_sheets: z.coerce.number().int().min(0).optional().nullable(),
  // Minutos de ajuste por pasada (sólo offset).
  ajuste_minutes: z.coerce.number().int().positive().max(600).optional().nullable(),
  waste_notes: z.string().max(2000).optional().nullable(),
  issues: z.string().max(2000).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
});

const TransitionSchema = z.object({
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  metadata: z.record(z.any()).optional(),
  rollback: z.boolean().optional(),
  stage_report: StageReportSchema.optional().nullable(),
});

// POST /api/ots/[id]/transition
// Lo que pasa al mover vive en `moveOT` (src/lib/ot-move.ts), el mismo camino
// que el avance parcial, el masivo y el parte de WhatsApp.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const rl = enforceRouteRateLimit({
    req,
    key: `ots:${buildRateLimitActor(req, auth.id)}:transition`,
    limit: 60,
    windowMs: 60_000,
    message: 'Demasiados cambios de estado seguidos. Espera un momento y reintenta.',
  });
  if (rl) return rl;

  try {
    const { id } = await params;
    const parsed = TransitionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    if (!isValidStatus(parsed.data.to_status)) {
      return NextResponse.json({ error: 'Estado destino inválido' }, { status: 400 });
    }

    const r = parsed.data.stage_report;
    const result = await moveOT({
      otId: id,
      toStatus: parsed.data.to_status as OTWorkflowStatus,
      actor: { id: auth.id, role: auth.role!, name: auth.name ?? auth.email },
      rollback: parsed.data.rollback ?? false,
      reason: parsed.data.reason ?? null,
      metadata: parsed.data.metadata ?? {},
      stageReport: r
        ? {
            hours: r.hours ?? null,
            mermaSheets: r.merma_sheets ?? null,
            ajusteMinutes: r.ajuste_minutes ?? null,
            wasteNotes: r.waste_notes ?? null,
            issues: r.issues ?? null,
            observations: r.observations ?? null,
          }
        : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json(
      result.warnings.length > 0 ? { ...result.ot, warning: result.warnings.join(' ') } : result.ot,
    );
  } catch (error) {
    console.error('Error transitioning OT:', error);
    return NextResponse.json({ error: 'No se pudo mover la OT de estado' }, { status: 500 });
  }
}

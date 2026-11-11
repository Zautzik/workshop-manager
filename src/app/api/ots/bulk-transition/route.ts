import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { moveOT } from '@/lib/ot-move';

const BulkTransitionSchema = z.object({
  ot_ids: z.array(z.string().uuid()).min(1).max(200),
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

/**
 * Cuántas OT se mueven a la vez. Cada una pasa por `moveOT` —las mismas
 * compuertas, pasada, salida de papel y aviso que el tablero—, que hace sus propias
 * consultas. Antes este bulk validaba todo en lote para no caer en N+1, y por
 * eso era otra implementación: contaba como calidad interna lo firmado en el
 * portal del cliente, no miraba el precio, no escribía la pasada, no descontaba
 * papel ni avisaba. Con un tope de concurrencia el costo queda acotado y el
 * movimiento es uno solo.
 */
const CONCURRENCIA = 5;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const rl = enforceRouteRateLimit({
    req,
    key: `ots:${buildRateLimitActor(req, auth.id)}:bulk-transition`,
    limit: 10,
    windowMs: 60_000,
    message: 'Too many OT bulk transitions. Please wait before retrying.',
  });
  if (rl) return rl;

  try {
    const parsed = BulkTransitionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    if (!isValidStatus(parsed.data.to_status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const toStatus = parsed.data.to_status as OTWorkflowStatus;
    const otIds = [...new Set(parsed.data.ot_ids)];

    const { data: job, error: jobInsertError } = await supabaseAdmin
      .from('bulk_operation_jobs')
      .insert([{
        operation_type: 'ot_bulk_transition',
        requested_by: auth.id,
        status: 'running',
        payload: { ot_ids: otIds, to_status: toStatus, reason: parsed.data.reason ?? null },
      }])
      .select('id')
      .single();
    if (jobInsertError) {
      console.error('Error creating bulk operation job:', jobInsertError);
      return NextResponse.json({ error: 'Failed to initialize bulk transition job' }, { status: 500 });
    }

    const failures: Array<{ ot_id: string; error: string }> = [];
    let successCount = 0;
    const actor = { id: auth.id, role: auth.role!, name: auth.name ?? auth.email };

    const queue = [...otIds];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCIA, queue.length) }, async () => {
        for (let otId = queue.shift(); otId; otId = queue.shift()) {
          const r = await moveOT({
            otId,
            toStatus,
            actor,
            reason: parsed.data.reason ?? null,
            metadata: { bulk_job_id: job?.id ?? null },
          });
          if (r.ok) successCount += 1;
          else failures.push({ ot_id: otId, error: r.error });
        }
      }),
    );
    const failedCount = failures.length;

    if (job?.id) {
      const { error: jobUpdateError } = await supabaseAdmin
        .from('bulk_operation_jobs')
        .update({
          status: failedCount > 0 && successCount === 0 ? 'failed' : 'completed',
          result: { success_count: successCount, failed_count: failedCount, failures },
          completed_at: new Date().toISOString(),
          error_message: failedCount > 0 ? 'One or more transitions failed' : null,
        })
        .eq('id', job.id);
      if (jobUpdateError) console.error('Error updating bulk operation job:', jobUpdateError);
    }

    return NextResponse.json({
      ok: true,
      job_id: job?.id ?? null,
      success_count: successCount,
      failed_count: failedCount,
      failures,
    });
  } catch (error) {
    console.error('Error in bulk transition:', error);
    return NextResponse.json({ error: 'Failed to run bulk transition' }, { status: 500 });
  }
}

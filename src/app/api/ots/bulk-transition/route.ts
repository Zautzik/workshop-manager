import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import type { Json } from '@/integrations/supabase/types';
import { isValidStatus, type OTWorkflowStatus, validateTransition } from '@/lib/ot-state-machine';
import { loadRoleAccess } from '@/lib/transition-rules';
import { buildOTSpec } from '@/lib/ot-spec';

const BulkTransitionSchema = z.object({
  ot_ids: z.array(z.string().uuid()).min(1).max(200),
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

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
    const otIds = parsed.data.ot_ids;

    const db = supabaseAdmin;
    const { data: job, error: jobInsertError } = await db
      .from('bulk_operation_jobs')
      .insert([
        {
          operation_type: 'ot_bulk_transition',
          requested_by: auth.id,
          status: 'running',
          payload: {
            ot_ids: otIds,
            to_status: toStatus,
            reason: parsed.data.reason ?? null,
          },
        },
      ])
      .select('id')
      .single();

    if (jobInsertError) {
      console.error('Error creating bulk operation job:', jobInsertError);
      return NextResponse.json({ error: 'Failed to initialize bulk transition job' }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    let successCount = 0;
    let failedCount = 0;
    const failures: Array<{ ot_id: string; error: string }> = [];

    // ── Batch pre-fetch: fixed number of queries regardless of how many OTs ──
    // Previously this loop did 3-4 queries per OT (N+1), timing out at ~50+ OTs.
    //
    // Auditoría de mensajería 2026-09-06: este bulk llamaba a validateTransition
    // sin `spec`/`requirements`/`openPasses` -- no porque el caso no importara,
    // sino porque nadie los había ido a buscar. Esas tres compuertas se apagan
    // solas cuando su dato no llega (ver ot-state-machine.ts), así que el bulk
    // podía saltar una OT de pre_press a completed sin que la ficha incompleta,
    // los requisitos de Compras sin resolver, o una pasada abierta lo frenaran
    // -- exactamente lo que sí frena a /transition, la ruta de a una OT por vez.
    const [
      otsResult, approvalsResult, costsResult, roleAccess,
      programaResult, operacionesResult, arteResult, requisitosResult, abiertasResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('ots')
        .select(
          'id, ot_number, status, client_id, product_name, product_type, quantity, ' +
          'width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back, ' +
          'ink_coverage, deadline, assigned_machine_id, substrate_brand, substrate_supplier, sin_arte, ' +
          'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, ' +
          'finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion, ' +
          'die_source, die_code, die_id, cliche_code, relieve_matrix_code, lamination_type',
        )
        .in('id', otIds),
      supabaseAdmin.from('ot_approvals').select('ot_id').in('ot_id', otIds).eq('status', 'approved'),
      supabaseAdmin.from('ot_real_costs').select('ot_id').in('ot_id', otIds),
      loadRoleAccess(),
      // Presencia, no conteo: la compuerta de ficha sólo pregunta si existe rastro.
      supabaseAdmin.from('ot_machine_schedule').select('ot_id').in('ot_id', otIds),
      supabaseAdmin.from('ot_operations').select('ot_id').in('ot_id', otIds),
      supabaseAdmin.from('ot_attachments').select('ot_id').in('ot_id', otIds),
      supabaseAdmin.from('ot_requirements').select('ot_id, description, status').in('ot_id', otIds),
      supabaseAdmin.from('ot_stage_reports').select('ot_id, workflow_step, created_at').in('ot_id', otIds).is('hours', null),
    ]);

    // Index into Maps/Sets for O(1) lookup inside the validation loop.
    // La cadena de `select` concatenada no la puede inferir el tipo generado
    // (mismo defecto que ya tiene /transition) — la fila se lee suelta.
    type OTRow = { id: string; ot_number: string; status: string } & Record<string, any>;
    const otMap = new Map<string, OTRow>(
      ((otsResult.data ?? []) as any[]).map((ot) => [ot.id, ot as OTRow])
    );
    const toIdSet = (rows: unknown): Set<string> =>
      new Set(((rows ?? []) as { ot_id: string | null }[]).map((r) => r.ot_id).filter((id): id is string => !!id));
    const approvedOtIds = toIdSet(approvalsResult.data);
    const costsOtIds = toIdSet(costsResult.data);
    const programaOtIds = toIdSet(programaResult.data);
    const operacionesOtIds = toIdSet(operacionesResult.data);
    const arteOtIds = toIdSet(arteResult.data);

    const groupByOt = <T extends { ot_id: string }>(rows: T[] | null): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const row of rows ?? []) map.set(row.ot_id, [...(map.get(row.ot_id) ?? []), row]);
      return map;
    };
    const requisitosByOt = groupByOt(requisitosResult.data as ({ ot_id: string; description: string; status: string })[] | null);
    const abiertasByOt = groupByOt(abiertasResult.data as ({ ot_id: string; workflow_step: string; created_at: string })[] | null);

    // ── Validate transitions in JS (no DB calls) ──────────────────────────
    const successIds: string[] = [];

    for (const otId of otIds) {
      const ot = otMap.get(otId);

      if (!ot || !isValidStatus(ot.status)) {
        failedCount += 1;
        failures.push({ ot_id: otId, error: 'OT not found or invalid current status' });
        continue;
      }

      const check = validateTransition({
        fromStatus: ot.status as OTWorkflowStatus,
        toStatus,
        role: auth.role!,
        roleAccess,
        hasApprovedApproval: approvedOtIds.has(otId),
        hasAnyRealCosts: costsOtIds.has(otId),
        spec: buildOTSpec(ot, {
          impositionConfirmed: programaOtIds.has(otId),
          operationsReviewed: operacionesOtIds.has(otId),
          artAttached: arteOtIds.has(otId),
        }),
        // `undefined` sólo si la consulta BATCH falló entera -- ahí "no se
        // sabe" de verdad, y hay que apagar la compuerta para las 200 OT, no
        // sólo para la que tuvo mala suerte. Si la consulta vino bien, una OT
        // sin filas es una respuesta real ("no tiene nada pendiente"), igual
        // que en /transition.
        requirements: requisitosResult.error ? undefined : (requisitosByOt.get(otId) ?? []),
        openPasses: abiertasResult.error ? undefined : (abiertasByOt.get(otId) ?? []),
      });

      if (!check.ok) {
        failedCount += 1;
        failures.push({ ot_id: otId, error: check.message ?? 'Transition rejected' });
        continue;
      }

      successIds.push(otId);
    }

    // ── Batch update with concurrency guard ──────────────────────────────
    // Group successIds by fromStatus so each UPDATE can add a WHERE clause
    // checking the current status hasn't changed since we pre-fetched.
    // This prevents a TOCTOU race where two concurrent bulk-transition
    // requests both read the same OT, both pass validation, and the second
    // write silently overwrites a status set by the first.
    if (successIds.length > 0) {
      // Build groups: fromStatus → ids that were in that status at read time.
      const byFromStatus = new Map<string, string[]>();
      for (const id of successIds) {
        const from = otMap.get(id)!.status;
        const group = byFromStatus.get(from) ?? [];
        group.push(id);
        byFromStatus.set(from, group);
      }

      // Run one UPDATE per fromStatus group — each scoped by .eq('status', fromStatus)
      // so rows modified since our pre-fetch are left untouched.
      // completed_at follows the status (stamped on completion, cleared when a
      // rollback leaves completed) — mirrors the single-transition route.
      const updateResults = await Promise.all(
        [...byFromStatus.entries()].map(([fromStatus, ids]) =>
          supabaseAdmin
            .from('ots')
            .update({
              status: toStatus,
              updated_at: nowIso,
              completed_at:
                toStatus === 'completed' ? nowIso : fromStatus === 'completed' ? null : undefined,
            })
            .in('id', ids)
            .eq('status', fromStatus as OTWorkflowStatus)   // ← concurrency guard
            .select('id'),
        ),
      );

      const hardError = updateResults.find((r) => r.error);
      if (hardError) {
        // DB-level failure — treat the entire batch as failed.
        failedCount += successIds.length;
        failures.push(
          ...successIds.map((id) => ({ ot_id: id, error: 'Failed to update OT status' })),
        );
      } else {
        // Collect the IDs that were actually written.
        const updatedIds = new Set<string>(
          updateResults.flatMap(({ data }) =>
            (data ?? []).map((r: { id: string }) => r.id),
          ),
        );
        // Any successId not in updatedIds was modified by a concurrent request.
        for (const id of successIds) {
          if (updatedIds.has(id)) {
            successCount += 1;
          } else {
            failedCount += 1;
            failures.push({ ot_id: id, error: 'Concurrent modification — transition skipped' });
          }
        }

        // Audit trail for the rows actually written — best-effort, non-blocking.
        const historyRows = [...updatedIds].map((updatedId) => ({
          ot_id: updatedId,
          from_status: otMap.get(updatedId)!.status as OTWorkflowStatus,
          to_status: toStatus,
          changed_by: auth.id,
          changed_by_role: auth.role,
          reason: parsed.data.reason ?? null,
          rollback: false,
          metadata: { bulk_job_id: job?.id ?? null } as unknown as Json,
        }));
        if (historyRows.length > 0) {
          const { error: historyError } = await supabaseAdmin
            .from('ot_status_history')
            .insert(historyRows);
          if (historyError) {
            console.error('Error writing bulk OT status history:', historyError);
          }
        }
      }
    }

    if (job?.id) {
      const finalStatus = failedCount > 0 && successCount === 0 ? 'failed' : 'completed';
      const { error: jobUpdateError } = await db
        .from('bulk_operation_jobs')
        .update({
          status: finalStatus,
          result: {
            success_count: successCount,
            failed_count: failedCount,
            failures,
          },
          completed_at: new Date().toISOString(),
          error_message: failedCount > 0 ? 'One or more transitions failed' : null,
        })
        .eq('id', job.id);

      if (jobUpdateError) {
        console.error('Error updating bulk operation job:', jobUpdateError);
      }
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

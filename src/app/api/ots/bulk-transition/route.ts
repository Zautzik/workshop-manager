import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, type OTWorkflowStatus, validateTransition } from '@/lib/ot-state-machine';

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

    const db = supabaseAdmin as any;
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

    // ── Batch pre-fetch: 3 queries regardless of how many OTs ─────────────
    // Previously this loop did 3-4 queries per OT (N+1), timing out at ~50+ OTs.
    const [otsResult, approvalsResult, costsResult] = await Promise.all([
      supabaseAdmin
        .from('ots')
        .select('id, ot_number, status')
        .in('id', otIds),
      supabaseAdmin
        .from('ot_approvals')
        .select('ot_id')
        .in('ot_id', otIds)
        .eq('status', 'approved'),
      supabaseAdmin
        .from('ot_real_costs')
        .select('ot_id')
        .in('ot_id', otIds),
    ]);

    // Index into Maps/Sets for O(1) lookup inside the validation loop.
    type OTRow = { id: string; ot_number: string; status: string };
    const otMap = new Map<string, OTRow>(
      (otsResult.data ?? []).map((ot) => [ot.id, ot])
    );
    const approvedOtIds = new Set<string>(
      (approvalsResult.data ?? []).map((a: { ot_id: string }) => a.ot_id)
    );
    const costsOtIds = new Set<string>(
      (costsResult.data ?? []).map((c: { ot_id: string }) => c.ot_id)
    );

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
        hasApprovedApproval: approvedOtIds.has(otId),
        hasAnyRealCosts: costsOtIds.has(otId),
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
      const updateResults = await Promise.all(
        [...byFromStatus.entries()].map(([fromStatus, ids]) =>
          supabaseAdmin
            .from('ots')
            .update({ status: toStatus, updated_at: nowIso })
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

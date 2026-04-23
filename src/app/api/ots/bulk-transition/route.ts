import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { isValidStatus, type OTWorkflowStatus, validateTransition } from '@/lib/ot-state-machine';

const BulkTransitionSchema = z.object({
  ot_ids: z.array(z.string().uuid()).min(1).max(200),
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

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

    for (const otId of otIds) {
      const { data: ot, error: otError } = await supabaseAdmin
        .from('ots')
        .select('id, ot_number, status')
        .eq('id', otId)
        .single();

      if (otError || !ot || !isValidStatus(ot.status)) {
        failedCount += 1;
        failures.push({ ot_id: otId, error: 'OT not found or invalid current status' });
        continue;
      }

      const [approvalResult, costsResult] = await Promise.all([
        supabaseAdmin
          .from('ot_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('ot_id', otId)
          .eq('status', 'approved'),
        supabaseAdmin
          .from('ot_real_costs')
          .select('id', { count: 'exact', head: true })
          .eq('ot_id', otId),
      ]);

      const check = validateTransition({
        fromStatus: ot.status as OTWorkflowStatus,
        toStatus,
        role: auth.role!,
        hasApprovedApproval: (approvalResult.count ?? 0) > 0,
        hasAnyRealCosts: (costsResult.count ?? 0) > 0,
      });

      if (!check.ok) {
        failedCount += 1;
        failures.push({ ot_id: otId, error: check.message ?? 'Transition rejected' });
        continue;
      }

      const { data: updatedOt, error: updateError } = await supabaseAdmin
        .from('ots')
        .update({ status: toStatus, updated_at: nowIso })
        .eq('id', otId)
        .select('id, ot_number, status')
        .single();

      if (updateError || !updatedOt) {
        failedCount += 1;
        failures.push({ ot_id: otId, error: 'Failed to update OT status' });
        continue;
      }

      successCount += 1;
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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  isValidStatus,
  type OTWorkflowStatus,
  validateTransition,
} from '@/lib/ot-state-machine';

const TransitionSchema = z.object({
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

// POST /api/ots/[id]/transition
// Validates workflow rules and records audited state transition.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = TransitionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const toStatusRaw = parsed.data.to_status;
    if (!isValidStatus(toStatusRaw)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const toStatus = toStatusRaw as OTWorkflowStatus;

    const { data: ot, error: otError } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, status')
      .eq('id', id)
      .single();

    if (otError || !ot) {
      return NextResponse.json({ error: 'OT not found' }, { status: 404 });
    }

    const fromStatus = ot.status as OTWorkflowStatus;

    const [approvalResult, costsResult] = await Promise.all([
      supabaseAdmin
        .from('ot_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id)
        .eq('status', 'approved'),
      supabaseAdmin
        .from('ot_real_costs')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id),
    ]);

    const transitionCheck = validateTransition({
      fromStatus,
      toStatus,
      role: auth.role!,
      hasApprovedApproval: (approvalResult.count ?? 0) > 0,
      hasAnyRealCosts: (costsResult.count ?? 0) > 0,
    });

    if (!transitionCheck.ok) {
      return NextResponse.json(
        {
          error: transitionCheck.message ?? 'Transition rejected',
          code: transitionCheck.code,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedOt, error: updateError } = await supabaseAdmin
      .from('ots')
      .update({
        status: toStatus,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select('id, ot_number, status, updated_at')
      .single();

    if (updateError || !updatedOt) {
      console.error('Error updating OT status:', updateError);
      return NextResponse.json({ error: 'Failed to update OT status' }, { status: 500 });
    }

    const db = supabaseAdmin as any;

    const { error: transitionError } = await db
      .from('ot_state_transitions')
      .insert([
        {
          ot_id: id,
          from_status: fromStatus,
          to_status: toStatus,
          changed_by: auth.id,
          reason: parsed.data.reason ?? null,
          metadata: parsed.data.metadata ?? {},
          created_at: nowIso,
        },
      ]);

    if (transitionError) {
      console.error('Error logging transition:', transitionError);
    }

    const approverRoles = ['admin', 'supervisor', 'manager'];
    const { data: candidateUsers } = await db
      .from('user_roles')
      .select('user_id, role')
      .in('role', approverRoles)
      .neq('user_id', auth.id)
      .limit(20);

    if (Array.isArray(candidateUsers) && candidateUsers.length > 0) {
      const notifications = candidateUsers.map((row: { user_id: string; role: string }) => ({
        user_id: row.user_id,
        type: 'ot_status_changed',
        title: `OT ${updatedOt.ot_number} moved to ${toStatus}`,
        message: `Changed by ${auth.name ?? auth.email}`,
        resource_type: 'ot',
        resource_id: id,
        metadata: {
          from_status: fromStatus,
          to_status: toStatus,
          by_role: auth.role,
        },
      }));

      const { error: notificationError } = await db.from('notifications').insert(notifications);
      if (notificationError) {
        console.error('Error creating notifications:', notificationError);
      }
    }

    return NextResponse.json(updatedOt);
  } catch (error) {
    console.error('Error transitioning OT:', error);
    return NextResponse.json({ error: 'Failed to transition OT' }, { status: 500 });
  }
}

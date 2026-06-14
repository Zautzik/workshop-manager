import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { isValidStatus, validateTransition, type OTWorkflowStatus } from '@/lib/ot-state-machine';

const SplitSchema = z.object({
  advance_quantity: z.number().positive(),
  target_status: z.string().min(1),
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

  const { advance_quantity, target_status } = parsed.data;

  if (!isValidStatus(target_status)) {
    return NextResponse.json({ error: 'Estado destino inválido.' }, { status: 400 });
  }
  const toStatus = target_status as OTWorkflowStatus;

  // Fetch the parent's current status (the transition source).
  const { data: ot, error: otErr } = await supabaseAdmin
    .from('ots')
    .select('id, status')
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

  return NextResponse.json(data);
}

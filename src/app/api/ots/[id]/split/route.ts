import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';

const SplitSchema = z.object({
  advance_quantity: z.number().positive(),
  target_status: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const actorId = typeof authResult === 'object' && 'id' in authResult ? authResult.id : null;
  const rl = enforceRouteRateLimit({
    req: request,
    key: `ots:${buildRateLimitActor(request, actorId)}:split`,
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

  // Fetch the original OT
  const { data: ot, error: otErr } = await supabaseAdmin
    .from('ots')
    .select('*')
    .eq('id', otId)
    .single();

  if (otErr || !ot) {
    return NextResponse.json({ error: 'OT not found' }, { status: 404 });
  }

  const totalQty = Number(ot.quantity ?? 0);
  if (advance_quantity >= totalQty) {
    return NextResponse.json(
      { error: 'advance_quantity must be less than the OT total quantity — use a full advance instead' },
      { status: 400 }
    );
  }

  const remaining_quantity = totalQty - advance_quantity;

  // Generate a shared split_group_id (reuse existing one if this OT was already split)
  const splitGroupId: string = ot.split_group_id ?? crypto.randomUUID();

  // Determine split labels
  const existingLabel: string = ot.split_label ?? 'A';
  const newLabel = String.fromCharCode(existingLabel.charCodeAt(0) + 1); // A→B, B→C, etc.

  // 1. Update original OT — reduce quantity, mark partial
  const { error: updateErr } = await supabaseAdmin
    .from('ots')
    .update({
      quantity: remaining_quantity,
      is_partial: true,
      split_group_id: splitGroupId,
      split_label: existingLabel,
    })
    .eq('id', otId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 2. Create the new split OT with the advancing quantity at target_status
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _ca, updated_at: _ua, ot_number, ...rest } = ot;

  const { data: newOT, error: insertErr } = await supabaseAdmin
    .from('ots')
    .insert({
      ...rest as any,
      ot_number: `${ot_number}-${newLabel}`,
      quantity: advance_quantity,
      status: target_status as any,
      is_partial: true,
      split_group_id: splitGroupId,
      split_label: newLabel,
      product_image_url: ot.product_image_url ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    // Rollback original quantity update
    await supabaseAdmin.from('ots').update({ quantity: totalQty, is_partial: false, split_group_id: null, split_label: null }).eq('id', otId);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    original: { id: otId, quantity: remaining_quantity },
    split: { id: newOT.id, ot_number: newOT.ot_number, quantity: advance_quantity, status: target_status },
    split_group_id: splitGroupId,
  });
}

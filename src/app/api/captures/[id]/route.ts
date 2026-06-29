import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const ReviewSchema = z.object({
  status: z.enum(['approved', 'auto_approved', 'rejected', 'needs_revision', 'pending']),
  review_comments: z.string().max(2000).optional().nullable(),
  // optional corrections applied before approval
  corrected_costs: z.any().optional(),
  quantity: z.coerce.number().optional(),
  unit_cost: z.coerce.number().optional(),
});

// PATCH /api/captures/[id] — review a capture. On approval, the router
// (apply_capture_event) feeds it to the right system (real costs / inventory).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = {
    status: d.status,
    reviewed_by: auth.id,
    reviewed_at: new Date().toISOString(),
  };
  if (d.review_comments !== undefined) patch.review_comments = d.review_comments;
  if (d.corrected_costs !== undefined) patch.corrected_costs = d.corrected_costs;
  if (d.quantity !== undefined) patch.quantity = d.quantity;
  if (d.unit_cost !== undefined) patch.unit_cost = d.unit_cost;

  const { data, error } = await supabaseAdmin
    .from('capture_events' as any)
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On approval, route the capture to its system (best-effort, like the legacy feed).
  let applyWarning: string | undefined;
  const row = data as any;
  if ((d.status === 'approved' || d.status === 'auto_approved') && row && !row.applied) {
    const { error: applyErr } = await supabaseAdmin.rpc('apply_capture_event' as any, { p_event_id: id });
    if (applyErr) applyWarning = `Aprobada, pero no se pudo aplicar: ${applyErr.message}`;
  }

  if (applyWarning) {
    return NextResponse.json({ data, _warning: applyWarning }, { status: 202 });
  }
  return NextResponse.json({ data });
}

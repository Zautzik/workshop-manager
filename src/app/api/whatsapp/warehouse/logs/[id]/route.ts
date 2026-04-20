/**
 * @fileoverview Warehouse Log Detail + Review API
 *
 * GET   /api/whatsapp/warehouse/logs/[id]  — Single log detail
 * PATCH /api/whatsapp/warehouse/logs/[id]  — Supervisor review (approve/reject)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';

type Params = { params: Promise<{ id: string }> };

/* ─── GET: Single log ────────────────────────────────────────── */

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

/* ─── PATCH: Supervisor review ───────────────────────────────── */

const ReviewSchema = z.object({
  review_status: z.enum(['approved', 'rejected', 'needs_revision']),
  review_comments: z.string().max(500).optional(),
  corrected_quantity: z.number().positive().optional(),
  corrected_unit_cost: z.number().min(0).optional(),
  lot_id: z.string().uuid().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = ReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const review = parsed.data;

  // Verify the log exists and is reviewable
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .select('id, review_status, action_type, item_id, quantity')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.review_status !== 'pending' && existing.review_status !== 'needs_revision') {
    return NextResponse.json(
      { error: 'Log already reviewed', current_status: existing.review_status },
      { status: 409 },
    );
  }

  // Update review fields
  const updateData: Record<string, unknown> = {
    review_status: review.review_status,
    reviewed_by: auth.id,
    reviewed_at: new Date().toISOString(),
    review_comments: review.review_comments ?? null,
  };

  if (review.corrected_quantity !== undefined) {
    updateData.corrected_quantity = review.corrected_quantity;
  }
  if (review.corrected_unit_cost !== undefined) {
    updateData.corrected_unit_cost = review.corrected_unit_cost;
  }
  if (review.lot_id !== undefined) {
    updateData.lot_id = review.lot_id;
  }

  const { error: updateError } = await supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If approved, feed to inventory
  let feedWarning: string | undefined;
  if (review.review_status === 'approved' && existing.item_id) {
    const finalQty = review.corrected_quantity ?? existing.quantity;
    if (finalQty && finalQty > 0) {
      try {
        const { error: feedError } = await supabaseAdmin.rpc(
          'feed_warehouse_to_inventory',
          { log_id: id },
        );

        if (feedError) {
          feedWarning = `Aprobado pero no se pudo registrar en inventario: ${feedError.message}`;
        }
      } catch (e) {
        feedWarning = `Aprobado pero error al registrar en inventario: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  const response: Record<string, unknown> = {
    status: 'updated',
    review_status: review.review_status,
  };

  if (feedWarning) {
    response._warning = feedWarning;
    return NextResponse.json(response, { status: 202 });
  }

  return NextResponse.json(response);
}

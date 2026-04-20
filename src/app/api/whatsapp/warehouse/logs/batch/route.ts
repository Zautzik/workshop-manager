/**
 * @fileoverview Warehouse Batch Review API
 *
 * POST /api/whatsapp/warehouse/logs/batch — Batch approve/reject up to 50 logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';

const BatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  review_status: z.enum(['approved', 'rejected']),
  review_comments: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = BatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ids, review_status, review_comments } = parsed.data;

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const id of ids) {
    // Update review status
    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_warehouse_logs')
      .update({
        review_status,
        reviewed_by: auth.id,
        reviewed_at: new Date().toISOString(),
        review_comments: review_comments ?? null,
      })
      .eq('id', id)
      .in('review_status', ['pending', 'needs_revision']);

    if (updateError) {
      results.push({ id, ok: false, error: updateError.message });
      continue;
    }

    // If approved, try to feed to inventory
    if (review_status === 'approved') {
      try {
        const { error: feedError } = await supabaseAdmin.rpc(
          'feed_warehouse_to_inventory',
          { log_id: id },
        );

        if (feedError) {
          results.push({ id, ok: true, error: `Approved but inventory feed failed: ${feedError.message}` });
          continue;
        }
      } catch (e) {
        results.push({ id, ok: true, error: `Approved but inventory feed error: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
    }

    results.push({ id, ok: true });
  }

  const successes = results.filter((r) => r.ok).length;
  return NextResponse.json({
    total: ids.length,
    successes,
    failures: ids.length - successes,
    results,
  });
}

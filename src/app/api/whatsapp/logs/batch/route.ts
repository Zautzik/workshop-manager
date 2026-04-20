/**
 * @fileoverview Batch Review API for WhatsApp Production Logs
 *
 * POST /api/whatsapp/logs/batch — Approve or reject multiple logs at once
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const BatchReviewSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['approve', 'reject']),
  comments: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['supervisor', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const parsed = BatchReviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ids, action, comments } = parsed.data;
    const statusMap = { approve: 'approved', reject: 'rejected' } as const;

    // Update all logs in batch
    const { data, error } = await supabaseAdmin
      .from('whatsapp_production_logs')
      .update({
        review_status: statusMap[action],
        reviewed_by: auth.id,
        reviewed_at: new Date().toISOString(),
        review_comments: comments || `Revisión masiva: ${action}`,
      })
      .in('id', ids)
      .eq('review_status', 'pending') // only update pending logs
      .select('id, ot_id');

    if (error) {
      console.error('Batch review error:', error);
      return NextResponse.json({ error: 'Failed to batch update' }, { status: 500 });
    }

    // If approving, feed costs for each log that has an ot_id
    const feedResults: { id: string; success: boolean; error?: string }[] = [];

    if (action === 'approve' && data) {
      for (const log of data) {
        if (!log.ot_id) {
          feedResults.push({ id: log.id, success: false, error: 'No OT linked' });
          continue;
        }
        const { error: feedError } = await supabaseAdmin
          .rpc('feed_whatsapp_to_real_costs', { log_id: log.id });

        feedResults.push({
          id: log.id,
          success: !feedError,
          error: feedError?.message,
        });
      }
    }

    return NextResponse.json({
      updated: data?.length ?? 0,
      action,
      feed_results: action === 'approve' ? feedResults : undefined,
    });
  } catch (error) {
    console.error('Error in batch review:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

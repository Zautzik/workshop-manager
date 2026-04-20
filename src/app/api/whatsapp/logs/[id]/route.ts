/**
 * @fileoverview WhatsApp Log Review API — Supervisor Approval
 *
 * PATCH /api/whatsapp/logs/[id]   — Review (approve/reject) a log
 * GET   /api/whatsapp/logs/[id]   — Get single log detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'needs_revision']),
  comments: z.string().max(500).optional(),
  corrected_data: z.record(z.unknown()).optional(),
  corrected_costs: z.record(z.unknown()).optional(),
});

/* ─── GET: Single log ────────────────────────────────────────── */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('whatsapp_production_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

/* ─── PATCH: Review a log ────────────────────────────────────── */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(['supervisor', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = ReviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, comments, corrected_data, corrected_costs } = parsed.data;

    // Map action to status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      needs_revision: 'needs_revision',
    };

    const updatePayload: Record<string, unknown> = {
      review_status: statusMap[action],
      reviewed_by: auth.id,
      reviewed_at: new Date().toISOString(),
      review_comments: comments || null,
    };

    if (corrected_data) {
      updatePayload.corrected_data = corrected_data;
    }

    if (corrected_costs) {
      updatePayload.corrected_costs = corrected_costs;
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_production_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error reviewing WA log:', error);
      return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
    }

    // If approved, feed costs into ot_real_costs
    if (action === 'approve' && data?.ot_id) {
      const { error: feedError } = await supabaseAdmin
        .rpc('feed_whatsapp_to_real_costs', { log_id: id });

      if (feedError) {
        console.error('Error feeding to real costs:', { id, error: feedError });
        // Return partial success with warning so UI can show the issue
        return NextResponse.json({
          ...data,
          _warning: 'Aprobado pero no se pudieron integrar los costos al sistema',
          _feed_error: feedError.message,
        }, { status: 202 });
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in WA review PATCH:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * @fileoverview WhatsApp Production Summary API
 *
 * GET /api/whatsapp/summary — Dashboard statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Parallel queries for dashboard stats
    const [pendingRes, approvedRes, rejectedRes, activeRes, totalRes] = await Promise.all([
      supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'pending')
        .eq('message_type', 'end'),

      supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'approved')
        .eq('message_type', 'end')
        .gte('reviewed_at', todayISO),

      supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'rejected')
        .eq('message_type', 'end')
        .gte('reviewed_at', todayISO),

      // Active sessions: starts without matching ends
      supabaseAdmin
        .from('whatsapp_active_sessions')
        .select('start_id', { count: 'exact', head: true }),

      supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO),
    ]);

    // Average confidence of pending reviews
    const { data: pendingLogs } = await supabaseAdmin
      .from('whatsapp_production_logs')
      .select('parsed_data')
      .eq('review_status', 'pending')
      .eq('message_type', 'end')
      .limit(50);

    const confidences = (pendingLogs ?? [])
      .map((l: any) => l.parsed_data?.confidence ?? 0)
      // Normalize: the parser emits 0–100, but legacy seed rows stored a
      // 0–1 fraction — without this the dashboard showed "1%" (audit P3.4).
      .map((c: number) => (c > 0 && c <= 1 ? c * 100 : c))
      .filter((c: number) => c > 0);
    const avgConfidence = confidences.length > 0
      ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length)
      : 0;

    return NextResponse.json({
      pending_reviews: pendingRes.count ?? 0,
      approved_today: approvedRes.count ?? 0,
      rejected_today: rejectedRes.count ?? 0,
      active_sessions: activeRes.count ?? 0,
      total_today: totalRes.count ?? 0,
      avg_confidence: avgConfidence,
    });
  } catch (error) {
    console.error('Error in WA summary:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

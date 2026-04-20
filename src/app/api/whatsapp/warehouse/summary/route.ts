/**
 * @fileoverview Warehouse Summary API — Dashboard stats
 *
 * GET /api/whatsapp/warehouse/summary — Aggregated stats for warehouse dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Run parallel queries for efficiency
  const [pendingRes, approvedRes, rejectedRes, receivesRes, usesRes, returnsRes, totalRes] =
    await Promise.all([
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'pending'),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'approved')
        .gte('created_at', todayISO),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'rejected')
        .gte('created_at', todayISO),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'receive')
        .gte('created_at', todayISO),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'use')
        .gte('created_at', todayISO),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'return')
        .gte('created_at', todayISO),
      supabaseAdmin
        .from('whatsapp_warehouse_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO),
    ]);

  return NextResponse.json({
    pending_reviews: pendingRes.count ?? 0,
    approved_today: approvedRes.count ?? 0,
    rejected_today: rejectedRes.count ?? 0,
    receives_today: receivesRes.count ?? 0,
    consumptions_today: usesRes.count ?? 0,
    returns_today: returnsRes.count ?? 0,
    total_today: totalRes.count ?? 0,
  });
}

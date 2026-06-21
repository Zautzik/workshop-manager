import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { RETENTION_YEARS, summarizeRetention } from '@/lib/retention';

// GET /api/retention
// FSSC 22000 records-retention status: shows that traceability records (OTs and
// their evidence) are held for the mandatory 5 years and nothing is purged early.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const [otsRes, attRes, histRes] = await Promise.allSettled([
      supabaseAdmin.from('ots').select('created_at').order('created_at', { ascending: true }).limit(20000),
      supabaseAdmin.from('ot_attachments').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('ot_status_history').select('id', { count: 'exact', head: true }),
    ]);

    const dates = (otsRes.status === 'fulfilled' ? (otsRes.value.data ?? []) : [])
      .map((o: { created_at: string | null }) => o.created_at)
      .filter((d): d is string => !!d);

    const r = summarizeRetention(dates);

    return NextResponse.json({
      policy_years: RETENTION_YEARS,
      total_ots: r.total,
      under_retention: r.under_retention,
      past_retention: r.past_retention,
      oldest_record: r.oldest,
      next_retention_expiry: r.next_retention_expiry,
      retained_through: r.retained_through,
      attachments_count: attRes.status === 'fulfilled' ? (attRes.value.count ?? 0) : 0,
      status_events_count: histRes.status === 'fulfilled' ? (histRes.value.count ?? 0) : 0,
    });
  } catch (error) {
    console.error('Error in retention route:', error);
    return NextResponse.json({ error: 'Failed to compute retention' }, { status: 500 });
  }
}

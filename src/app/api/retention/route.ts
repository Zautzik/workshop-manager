import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { RETENTION_YEARS, isUnderRetention, retentionUntil } from '@/lib/retention';

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

    const ots = (otsRes.status === 'fulfilled' ? (otsRes.value.data ?? []) : [])
      .map((o: { created_at: string | null }) => o.created_at)
      .filter((d): d is string => !!d);

    const now = new Date();
    const total = ots.length;
    let underRetention = 0;
    let firstUnderRetention: string | null = null;
    for (const createdAt of ots) {
      if (isUnderRetention(createdAt, now)) {
        underRetention += 1;
        if (firstUnderRetention === null) firstUnderRetention = createdAt; // list is asc → oldest first
      }
    }
    const pastRetention = total - underRetention;
    const oldest = ots[0] ?? null;
    const newest = ots[total - 1] ?? null;

    return NextResponse.json({
      policy_years: RETENTION_YEARS,
      total_ots: total,
      under_retention: underRetention,
      past_retention: pastRetention,
      oldest_record: oldest,
      // Next record to pass its 5-year window (the oldest still-retained OT):
      next_retention_expiry: firstUnderRetention ? retentionUntil(firstUnderRetention).toISOString() : null,
      // The most recent record is held until:
      retained_through: newest ? retentionUntil(newest).toISOString() : null,
      attachments_count: attRes.status === 'fulfilled' ? (attRes.value.count ?? 0) : 0,
      status_events_count: histRes.status === 'fulfilled' ? (histRes.value.count ?? 0) : 0,
    });
  } catch (error) {
    console.error('Error in retention route:', error);
    return NextResponse.json({ error: 'Failed to compute retention' }, { status: 500 });
  }
}

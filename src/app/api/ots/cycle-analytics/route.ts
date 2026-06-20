import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/ots/cycle-analytics
// Shop-floor flow intelligence reconstructed from ot_status_history:
//   • avg time-in-stage per pipeline stage  → bottleneck detection
//   • average lead time (creation → completed)
//   • WIP and current distribution across stages
//   • a recent "who moved what" activity feed
// All derived from data already captured by the transition routes — no new infra.

interface HistoryRow {
  id: string;
  ot_id: string;
  from_status: string | null;
  to_status: string;
  changed_by_role: string | null;
  rollback: boolean;
  created_at: string;
}

interface OtRow {
  id: string;
  ot_number: string | null;
  client_name: string | null;
  status: string | null;
  created_at: string | null;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const [{ data: histData, error: histError }, { data: otData, error: otError }] =
      await Promise.all([
        supabaseAdmin
          .from('ot_status_history')
          .select('id, ot_id, from_status, to_status, changed_by_role, rollback, created_at')
          .order('created_at', { ascending: true })
          .limit(5000),
        supabaseAdmin
          .from('ots')
          .select('id, ot_number, client_name, status, created_at')
          .limit(2000),
      ]);

    if (histError || otError) {
      console.error('Error fetching cycle analytics:', histError ?? otError);
      return NextResponse.json({ error: 'Failed to fetch cycle analytics' }, { status: 500 });
    }

    const history = (histData ?? []) as HistoryRow[];
    const ots = (otData ?? []) as OtRow[];
    const otById = new Map(ots.map((o) => [o.id, o]));

    // ── Time-in-stage: between consecutive transitions of the same OT, the order
    //    sits in the earlier row's to_status (== next row's from_status). ──
    const byOt = new Map<string, HistoryRow[]>();
    for (const row of history) {
      const list = byOt.get(row.ot_id) ?? [];
      list.push(row);
      byOt.set(row.ot_id, list);
    }

    const stageTotals = new Map<string, { totalHours: number; count: number }>();
    const leadTimes: number[] = [];

    for (const [otId, rowsRaw] of byOt) {
      const rows = rowsRaw.slice().sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      for (let i = 0; i < rows.length - 1; i++) {
        const stage = rows[i].to_status;
        const hours =
          (new Date(rows[i + 1].created_at).getTime() - new Date(rows[i].created_at).getTime()) /
          3_600_000;
        if (hours < 0) continue;
        const acc = stageTotals.get(stage) ?? { totalHours: 0, count: 0 };
        acc.totalHours += hours;
        acc.count += 1;
        stageTotals.set(stage, acc);
      }

      // Lead time: OT creation → its "completed" transition.
      const completed = rows.find((r) => r.to_status === 'completed');
      const ot = otById.get(otId);
      if (completed && ot?.created_at) {
        const lt =
          (new Date(completed.created_at).getTime() - new Date(ot.created_at).getTime()) /
          3_600_000;
        if (lt >= 0) leadTimes.push(lt);
      }
    }

    const stageStats = Array.from(stageTotals.entries())
      .map(([stage, { totalHours, count }]) => ({
        stage,
        avg_hours: count > 0 ? totalHours / count : 0,
        samples: count,
      }))
      .sort((a, b) => b.avg_hours - a.avg_hours);

    const bottleneck = stageStats.length > 0 ? stageStats[0] : null;

    const avgLeadTimeHours =
      leadTimes.length > 0 ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length : null;

    // ── Current snapshot from the live ots table ──
    const currentDistribution: Record<string, number> = {};
    let wip = 0;
    for (const ot of ots) {
      const s = ot.status ?? 'unknown';
      currentDistribution[s] = (currentDistribution[s] ?? 0) + 1;
      if (s !== 'completed') wip += 1;
    }

    // ── Recent activity feed (newest first) ──
    const recentActivity = history
      .slice(-40)
      .reverse()
      .map((row) => {
        const ot = otById.get(row.ot_id);
        return {
          id: row.id,
          ot_id: row.ot_id,
          ot_number: ot?.ot_number ?? null,
          client_name: ot?.client_name ?? null,
          from_status: row.from_status,
          to_status: row.to_status,
          changed_by_role: row.changed_by_role,
          rollback: row.rollback,
          created_at: row.created_at,
        };
      });

    return NextResponse.json({
      stage_stats: stageStats,
      bottleneck,
      avg_lead_time_hours: avgLeadTimeHours,
      completed_count: leadTimes.length,
      wip,
      current_distribution: currentDistribution,
      recent_activity: recentActivity,
      total_events: history.length,
    });
  } catch (error) {
    console.error('Error in cycle analytics route:', error);
    return NextResponse.json({ error: 'Failed to fetch cycle analytics' }, { status: 500 });
  }
}

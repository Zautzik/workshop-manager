import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/machines/activity
// Real machine load from ot_status_history (not a status snapshot): for each
// machine, the production hours, OTs processed and current active OTs, derived
// from the time its assigned OTs spent in active-production stages. The "bones
// report their load."
const PRODUCTION_STATUSES = new Set([
  'guillotine_first_cut', 'offset_printing', 'digital_printing', 'die_cutting',
  'guillotine_final_cut', 'workshop', 'workshop_revision',
]);
const DAY = 86_400_000;

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;

  const since = new Date(Date.now() - 30 * DAY).toISOString();

  try {
    const [machinesRes, otsRes, histRes] = await Promise.all([
      supabaseAdmin.from('machines').select('id, name, type, status'),
      supabaseAdmin.from('ots').select('id, assigned_machine_id, status'),
      supabaseAdmin
        .from('ot_status_history')
        .select('ot_id, to_status, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(10000),
    ]);

    if (machinesRes.error || otsRes.error || histRes.error) {
      console.error('Error fetching machine activity:', machinesRes.error ?? otsRes.error ?? histRes.error);
      return NextResponse.json({ error: 'Failed to fetch machine activity' }, { status: 500 });
    }

    const machines = (machinesRes.data ?? []) as Array<{ id: string; name: string | null; type: string | null; status: string | null }>;
    const ots = (otsRes.data ?? []) as Array<{ id: string; assigned_machine_id: string | null; status: string | null }>;
    const history = (histRes.data ?? []) as Array<{ ot_id: string; to_status: string; created_at: string }>;

    // ── Production hours per OT (dwell in production stages) ──
    const byOt = new Map<string, Array<{ to_status: string; created_at: string }>>();
    for (const h of history) {
      const list = byOt.get(h.ot_id) ?? [];
      list.push(h);
      byOt.set(h.ot_id, list);
    }
    const prodHoursByOt = new Map<string, number>();
    for (const [otId, rowsRaw] of byOt) {
      const rows = rowsRaw.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let hrs = 0;
      for (let i = 0; i < rows.length - 1; i++) {
        if (!PRODUCTION_STATUSES.has(rows[i].to_status)) continue;
        const dwell = (new Date(rows[i + 1].created_at).getTime() - new Date(rows[i].created_at).getTime()) / 3_600_000;
        if (dwell > 0) hrs += dwell;
      }
      prodHoursByOt.set(otId, hrs);
    }

    // ── Aggregate per machine (by the OT's current assigned machine) ──
    const otsByMachine = new Map<string, string[]>();
    const activeByMachine = new Map<string, number>();
    for (const ot of ots) {
      if (!ot.assigned_machine_id) continue;
      const list = otsByMachine.get(ot.assigned_machine_id) ?? [];
      list.push(ot.id);
      otsByMachine.set(ot.assigned_machine_id, list);
      if (ot.status && PRODUCTION_STATUSES.has(ot.status)) {
        activeByMachine.set(ot.assigned_machine_id, (activeByMachine.get(ot.assigned_machine_id) ?? 0) + 1);
      }
    }

    const rows = machines.map((m) => {
      const otIds = otsByMachine.get(m.id) ?? [];
      const productionHours = otIds.reduce((s, id) => s + (prodHoursByOt.get(id) ?? 0), 0);
      const otsProcessed = otIds.filter((id) => byOt.has(id)).length;
      return {
        machine_id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        production_hours: Math.round(productionHours * 10) / 10,
        ots_processed: otsProcessed,
        current_active: activeByMachine.get(m.id) ?? 0,
      };
    }).sort((a, b) => b.production_hours - a.production_hours);

    const totalHours = rows.reduce((s, r) => s + r.production_hours, 0);
    const totalActive = rows.reduce((s, r) => s + r.current_active, 0);
    const producing = rows.filter((r) => r.current_active > 0).length;

    return NextResponse.json({
      window_days: 30,
      machines: rows,
      summary: {
        machine_count: machines.length,
        total_production_hours: Math.round(totalHours * 10) / 10,
        producing_now: producing,
        active_ots: totalActive,
        busiest: rows[0]?.production_hours ? { name: rows[0].name, hours: rows[0].production_hours } : null,
      },
    });
  } catch (error) {
    console.error('Error in machine activity route:', error);
    return NextResponse.json({ error: 'Failed to fetch machine activity' }, { status: 500 });
  }
}

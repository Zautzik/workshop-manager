import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/maintenance/downtime?days=30
 *
 * Availability per machine, derived from `machine_downtime_logs`. That table
 * existed since the beginning with zero writers and zero readers, so the plant's
 * most basic operating number — is this press actually available? — had no raw
 * material. Work orders now open and close those rows automatically, and this
 * is where the number comes out.
 *
 * Availability = 1 − downtime hours ÷ calendar hours in the window. A machine
 * with an open downtime row is counted up to now, so a press that has been
 * apart for three days shows it immediately instead of only after someone
 * remembers to close the order.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30) || 30, 1), 365);

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 3_600_000);
  const windowHours = days * 24;

  const [logsRes, machinesRes] = await Promise.all([
    supabaseAdmin
      .from('machine_downtime_logs')
      .select('id, machine_id, reason, start_time, end_time, duration_hours, impact_description')
      .gte('start_time', since.toISOString())
      .order('start_time', { ascending: false }),
    supabaseAdmin.from('machines').select('id, name, type, status').eq('is_active', true),
  ]);

  if (logsRes.error) {
    return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
  }

  const logs = logsRes.data ?? [];
  const machines = machinesRes.data ?? [];

  const hoursFor = (log: (typeof logs)[number]) => {
    if (log.duration_hours != null) return Number(log.duration_hours);
    // Still open — count it up to now, don't pretend it hasn't happened.
    const start = new Date(log.start_time).getTime();
    const end = log.end_time ? new Date(log.end_time).getTime() : now.getTime();
    return Math.max(0, (end - start) / 3_600_000);
  };

  const byMachine = new Map<string, { hours: number; events: number; open: boolean }>();
  for (const log of logs) {
    if (!log.machine_id) continue;
    const acc = byMachine.get(log.machine_id) ?? { hours: 0, events: 0, open: false };
    acc.hours += hoursFor(log);
    acc.events += 1;
    if (!log.end_time) acc.open = true;
    byMachine.set(log.machine_id, acc);
  }

  const rows = machines
    .map((m) => {
      const acc = byMachine.get(m.id) ?? { hours: 0, events: 0, open: false };
      const downtimeHours = Math.round(acc.hours * 100) / 100;
      const availability = Math.max(0, Math.min(1, 1 - downtimeHours / windowHours));
      return {
        machine_id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        downtime_hours: downtimeHours,
        downtime_events: acc.events,
        currently_down: acc.open,
        availability_pct: Math.round(availability * 1000) / 10,
      };
    })
    .sort((a, b) => b.downtime_hours - a.downtime_hours);

  const totalDowntime = rows.reduce((s, r) => s + r.downtime_hours, 0);

  return NextResponse.json({
    window_days: days,
    machines: rows,
    totals: {
      downtime_hours: Math.round(totalDowntime * 100) / 100,
      machines_down_now: rows.filter((r) => r.currently_down).length,
      fleet_availability_pct:
        rows.length > 0
          ? Math.round((rows.reduce((s, r) => s + r.availability_pct, 0) / rows.length) * 10) / 10
          : 100,
    },
    recent: logs.slice(0, 20),
  });
}

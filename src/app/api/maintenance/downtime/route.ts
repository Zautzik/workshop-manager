import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

interface MachineRow {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface DowntimeWindowResult {
  machines: {
    machine_id: string;
    name: string;
    type: string;
    status: string;
    downtime_hours: number;
    downtime_events: number;
    currently_down: boolean;
    availability_pct: number;
    corrective_events: number;
    corrective_downtime_hours: number;
  }[];
  totals: {
    downtime_hours: number;
    machines_down_now: number;
    fleet_availability_pct: number;
    corrective_events: number;
    mtbf_hours: number | null;
    mttr_hours: number | null;
  };
  recent: unknown[];
}

/**
 * Un intervalo [since, until) evaluado por su cuenta. Extraído para poder
 * pedir dos ventanas -- la actual y la inmediatamente anterior de igual
 * largo -- y comparar el MTBF por máquina entre las dos (ver `compare=1`
 * más abajo), sin duplicar la aritmética.
 *
 * `until` acota tanto la búsqueda (una parada que arrancó en la ventana de
 * ANTES no debe contarse en la de ahora) como el downtime de una fila
 * todavía abierta -- contarla hasta "ahora" real inflaría cualquier ventana
 * pasada que la parada atraviese.
 */
async function computeDowntimeWindow(
  since: Date,
  until: Date,
  machines: MachineRow[],
): Promise<DowntimeWindowResult | { error: string }> {
  const windowHours = (until.getTime() - since.getTime()) / 3_600_000;

  const { data: logs, error } = await supabaseAdmin
    .from('machine_downtime_logs')
    .select('id, machine_id, reason, start_time, end_time, duration_hours, impact_description, work_order_id')
    .gte('start_time', since.toISOString())
    .lt('start_time', until.toISOString())
    .order('start_time', { ascending: false });

  if (error) return { error: error.message };

  const rows_ = logs ?? [];

  // MTBF/MTTR sólo tienen sentido contados sobre FALLAS — una parada
  // correctiva. `work_order_id` recién existe (ver migración
  // 20260910120000): las filas de antes quedan sin atribuir y no entran acá,
  // pero sí siguen contando para la disponibilidad general de abajo, que
  // debe incluir toda parada, planificada o no.
  const workOrderIds = rows_.map((l) => l.work_order_id).filter((id): id is string => !!id);
  let correctiveOrderIds = new Set<string>();
  if (workOrderIds.length > 0) {
    const { data: orders } = await supabaseAdmin
      .from('maintenance_work_orders')
      .select('id, work_order_type')
      .in('id', workOrderIds);
    correctiveOrderIds = new Set(
      (orders ?? []).filter((o) => o.work_order_type === 'correctivo').map((o) => o.id)
    );
  }

  const hoursFor = (log: (typeof rows_)[number]) => {
    if (log.duration_hours != null) return Number(log.duration_hours);
    // Todavía abierta -- se cuenta hasta el borde de ESTA ventana, no hasta
    // el momento real: una parada que sigue abierta hoy no puede inflar el
    // downtime de una ventana que ya terminó.
    const start = new Date(log.start_time).getTime();
    const end = log.end_time ? new Date(log.end_time).getTime() : until.getTime();
    return Math.max(0, (end - start) / 3_600_000);
  };

  const byMachine = new Map<
    string,
    { hours: number; events: number; open: boolean; correctiveHours: number; correctiveEvents: number }
  >();
  for (const log of rows_) {
    if (!log.machine_id) continue;
    const acc = byMachine.get(log.machine_id) ?? {
      hours: 0, events: 0, open: false, correctiveHours: 0, correctiveEvents: 0,
    };
    const hours = hoursFor(log);
    acc.hours += hours;
    acc.events += 1;
    if (!log.end_time) acc.open = true;
    if (log.work_order_id && correctiveOrderIds.has(log.work_order_id)) {
      acc.correctiveHours += hours;
      acc.correctiveEvents += 1;
    }
    byMachine.set(log.machine_id, acc);
  }

  const rows = machines
    .map((m) => {
      const acc = byMachine.get(m.id) ?? { hours: 0, events: 0, open: false, correctiveHours: 0, correctiveEvents: 0 };
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
        corrective_events: acc.correctiveEvents,
        corrective_downtime_hours: Math.round(acc.correctiveHours * 100) / 100,
      };
    })
    .sort((a, b) => b.downtime_hours - a.downtime_hours);

  const totalDowntime = rows.reduce((s, r) => s + r.downtime_hours, 0);
  const totalCorrectiveEvents = rows.reduce((s, r) => s + r.corrective_events, 0);
  const totalCorrectiveHours = rows.reduce((s, r) => s + r.corrective_downtime_hours, 0);
  // Tiempo operativo de toda la flota: la ventana de cada máquina menos TODA
  // su parada (preventiva incluida — mientras se hace mantención tampoco
  // produce), dividido sólo entre las fallas correctivas.
  const totalUptimeHours = Math.max(0, windowHours * rows.length - totalDowntime);

  return {
    machines: rows,
    totals: {
      downtime_hours: Math.round(totalDowntime * 100) / 100,
      machines_down_now: rows.filter((r) => r.currently_down).length,
      fleet_availability_pct:
        rows.length > 0
          ? Math.round((rows.reduce((s, r) => s + r.availability_pct, 0) / rows.length) * 10) / 10
          : 100,
      corrective_events: totalCorrectiveEvents,
      // null, nunca 0 ni Infinity: sin fallas correctivas atribuidas todavía
      // no hay MTBF/MTTR que mostrar, y un cero se leería como "nunca falla".
      mtbf_hours: totalCorrectiveEvents > 0 ? Math.round((totalUptimeHours / totalCorrectiveEvents) * 10) / 10 : null,
      mttr_hours: totalCorrectiveEvents > 0 ? Math.round((totalCorrectiveHours / totalCorrectiveEvents) * 10) / 10 : null,
    },
    recent: rows_.slice(0, 20),
  };
}

/**
 * GET /api/maintenance/downtime?days=30[&compare=1]
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
 *
 * `compare=1` adds a second evaluation over the immediately preceding window
 * of equal length, and a per-machine MTBF delta -- a single window only says
 * "this machine failed N times," never whether that's getting worse. Sin
 * fallas correctivas en NINGUNA de las dos ventanas, el delta es null, no 0:
 * no hay tendencia que afirmar todavía.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30) || 30, 1), 365);
  const compare = searchParams.get('compare') === '1';

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 3_600_000);

  const { data: machines, error: machinesError } = await supabaseAdmin
    .from('machines')
    .select('id, name, type, status')
    .eq('is_active', true);

  if (machinesError) {
    return NextResponse.json({ error: machinesError.message }, { status: 500 });
  }

  const current = await computeDowntimeWindow(since, now, machines ?? []);
  if ('error' in current) {
    return NextResponse.json({ error: current.error }, { status: 500 });
  }

  if (!compare) {
    return NextResponse.json({ window_days: days, ...current });
  }

  const previousSince = new Date(since.getTime() - days * 24 * 3_600_000);
  const previous = await computeDowntimeWindow(previousSince, since, machines ?? []);
  if ('error' in previous) {
    return NextResponse.json({ error: previous.error }, { status: 500 });
  }

  const previousByMachine = new Map(previous.machines.map((m) => [m.machine_id, m]));

  // MTBF por máquina, no sólo la flota entera: horas operativas de ESA
  // máquina en la ventana, divididas por sus fallas correctivas.
  const machineMtbf = (m: DowntimeWindowResult['machines'][number], windowH: number) =>
    m.corrective_events > 0 ? (windowH - m.downtime_hours) / m.corrective_events : null;

  const trend = current.machines.map((m) => {
    const prev = previousByMachine.get(m.machine_id);
    const currentMtbf = machineMtbf(m, days * 24);
    const previousMtbf = prev ? machineMtbf(prev, days * 24) : null;
    const delta =
      currentMtbf != null && previousMtbf != null
        ? Math.round((currentMtbf - previousMtbf) * 10) / 10
        : null;
    return {
      machine_id: m.machine_id,
      name: m.name,
      current_mtbf_hours: currentMtbf != null ? Math.round(currentMtbf * 10) / 10 : null,
      previous_mtbf_hours: previousMtbf != null ? Math.round(previousMtbf * 10) / 10 : null,
      // Negativo = empeoró (falla más seguido que antes).
      mtbf_delta_hours: delta,
      current_corrective_events: m.corrective_events,
      previous_corrective_events: prev?.corrective_events ?? 0,
    };
  });

  return NextResponse.json({
    window_days: days,
    ...current,
    trend,
  });
}

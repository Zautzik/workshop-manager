/**
 * Labor attribution — the last weld in the Golden Thread.
 *
 * The chain person → wage → machine → OT was already complete as data; what was
 * missing was money: when an operator ran the offset for an hour, that hour ×
 * their real wage never reached the OT's cost. Real costs were typed in by hand.
 *
 * Every rail already existed:
 *   · attendance_events   — clock_in/clock_out per employee PER STATION, from the
 *                           /estacion QR kiosk (the zero-friction human act)
 *   · worker_assignments  — employee → workstation → shift → date → ot_id
 *   · compensation_rates  — hourly_rate + overtime multiplier, effective-dated
 *   · ot_real_costs       — the canonical destination, with idempotent replace
 *
 * This module is the pure function in the middle: clock events + assignments +
 * rates in, costed labour lines out. No I/O, no Supabase — so the plant's real
 * edge cases (an operator who forgets to clock out, a double punch, a night
 * shift crossing midnight, one station running several OTs in a day) are all
 * decided here in testable code rather than inside a route.
 */

export interface ClockEvent {
  employee_id: string;
  station_id: string | null;
  /** ISO timestamp. */
  at: string;
  event_type: 'clock_in' | 'clock_out' | string;
}

export interface AssignmentRow {
  employee_id: string;
  workstation_id: string;
  ot_id: string | null;
  date: string;
  role?: string | null;
}

export interface RateRow {
  employee_id: string;
  hourly_rate: number;
  currency_code?: string | null;
  overtime_multiplier_50?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface WorkedInterval {
  employee_id: string;
  station_id: string | null;
  start: string;
  end: string;
  hours: number;
  /** True when the operator never clocked out and the shift cap closed it. */
  inferredEnd: boolean;
}

export interface LaborLine {
  ot_id: string;
  employee_id: string;
  station_id: string | null;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  currency: string;
  cost: number;
}

export interface AttributionWarning {
  code:
    | 'no_clock_out'
    | 'no_rate'
    | 'no_assignment'
    | 'unmatched_clock_out'
    | 'zero_length';
  employee_id: string;
  detail: string;
}

export interface AttributionResult {
  lines: LaborLine[];
  warnings: AttributionWarning[];
  /** Hours that were worked but could not be tied to any OT. */
  unattributedHours: number;
}

export interface AttributionOptions {
  /**
   * Hours past clock-in after which an un-closed shift is capped, instead of
   * running forever. A forgotten clock-out is the single most common kiosk
   * mistake; charging an OT 14 hours because of it is worse than capping.
   */
  maxShiftHours?: number;
  /** Hours in a normal day beyond which the overtime multiplier applies. */
  baseHoursPerDay?: number;
  /** Fallback when a rate row carries no multiplier. */
  defaultOvertimeMultiplier?: number;
}

const DEFAULTS: Required<AttributionOptions> = {
  maxShiftHours: 12,
  baseHoursPerDay: 9,
  defaultOvertimeMultiplier: 1.5,
};

const MS_PER_HOUR = 1000 * 60 * 60;

/** Round to 2 decimals without accumulating float noise. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Pair clock events into worked intervals, per employee AND station.
 *
 * Rules, chosen to match how a kiosk is actually used:
 *  · Events are sorted by time; a clock_in opens an interval, the next clock_out
 *    for that same employee closes it.
 *  · A second clock_in while one is open (double punch, or the operator moved to
 *    another machine without clocking out) closes the previous one at that moment.
 *  · A clock_out with nothing open is reported, not silently dropped.
 *  · An interval left open is capped at maxShiftHours and flagged `inferredEnd`,
 *    so a supervisor can see the day contains an estimate.
 *  · Intervals cross midnight naturally — they are timestamps, not wall clocks.
 */
export function pairClockEvents(
  events: ClockEvent[],
  options: AttributionOptions = {}
): { intervals: WorkedInterval[]; warnings: AttributionWarning[] } {
  const opts = { ...DEFAULTS, ...options };
  const warnings: AttributionWarning[] = [];
  const intervals: WorkedInterval[] = [];

  const byEmployee = new Map<string, ClockEvent[]>();
  for (const e of events) {
    if (!e?.employee_id || !e.at) continue;
    const list = byEmployee.get(e.employee_id) ?? [];
    list.push(e);
    byEmployee.set(e.employee_id, list);
  }

  for (const [employeeId, list] of byEmployee) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );

    let open: ClockEvent | null = null;

    const close = (endIso: string, inferred: boolean) => {
      if (!open) return;
      const startMs = new Date(open.at).getTime();
      const endMs = new Date(endIso).getTime();
      const hours = (endMs - startMs) / MS_PER_HOUR;

      if (hours > 0) {
        intervals.push({
          employee_id: employeeId,
          station_id: open.station_id ?? null,
          start: open.at,
          end: endIso,
          hours: round2(hours),
          inferredEnd: inferred,
        });
      } else {
        warnings.push({
          code: 'zero_length',
          employee_id: employeeId,
          detail: `Marca de entrada y salida sin tiempo entre ellas (${open.at}).`,
        });
      }
      open = null;
    };

    for (const event of sorted) {
      if (event.event_type === 'clock_in') {
        if (open) {
          // Moved machine or punched twice — close the previous stint here.
          close(event.at, false);
        }
        open = event;
      } else if (event.event_type === 'clock_out') {
        if (!open) {
          warnings.push({
            code: 'unmatched_clock_out',
            employee_id: employeeId,
            detail: `Marca de salida sin entrada previa (${event.at}).`,
          });
          continue;
        }
        close(event.at, false);
      }
    }

    if (open) {
      const openEvent: ClockEvent = open;
      const cappedEnd = new Date(
        new Date(openEvent.at).getTime() + opts.maxShiftHours * MS_PER_HOUR
      ).toISOString();
      warnings.push({
        code: 'no_clock_out',
        employee_id: employeeId,
        detail: `Turno sin marca de salida; se estimó un tope de ${opts.maxShiftHours} h desde ${openEvent.at}.`,
      });
      close(cappedEnd, true);
    }
  }

  return { intervals, warnings };
}

/** The compensation rate in force on a given date. */
export function rateOn(rates: RateRow[], employeeId: string, date: string): RateRow | null {
  const candidates = rates.filter((r) => {
    if (r.employee_id !== employeeId) return false;
    if (r.effective_from && r.effective_from > date) return false;
    if (r.effective_to && r.effective_to < date) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  // Most recently effective wins when several overlap.
  return candidates.sort((a, b) =>
    String(b.effective_from ?? '').localeCompare(String(a.effective_from ?? ''))
  )[0];
}

/**
 * Split a day's hours into regular and overtime for one employee.
 * Overtime is a property of the DAY, not of an individual interval, so it is
 * applied after all of an employee's hours for that date are known.
 */
export function splitOvertime(
  totalHours: number,
  baseHoursPerDay: number
): { regular: number; overtime: number } {
  const regular = Math.min(totalHours, baseHoursPerDay);
  return { regular: round2(regular), overtime: round2(Math.max(0, totalHours - baseHoursPerDay)) };
}

/**
 * Attribute one day of clock events to OTs and cost them.
 *
 * Station is the join: the assignment says which OT that employee was on at that
 * workstation that day. When a station ran several OTs in the day, the hours are
 * split evenly across them — the kiosk records presence at a machine, not which
 * job was on the press minute by minute, and pretending otherwise would invent
 * precision the data doesn't have.
 */
export function attributeLabor(
  input: {
    date: string;
    events: ClockEvent[];
    assignments: AssignmentRow[];
    rates: RateRow[];
  },
  options: AttributionOptions = {}
): AttributionResult {
  const opts = { ...DEFAULTS, ...options };
  const { intervals, warnings } = pairClockEvents(input.events, opts);
  const allWarnings = [...warnings];

  // employee → station → ot_ids assigned that day
  const assignmentIndex = new Map<string, string[]>();
  for (const a of input.assignments) {
    if (a.date !== input.date || !a.ot_id) continue;
    const key = `${a.employee_id}::${a.workstation_id}`;
    const list = assignmentIndex.get(key) ?? [];
    if (!list.includes(a.ot_id)) list.push(a.ot_id);
    assignmentIndex.set(key, list);
  }

  // Total hours per employee first, so overtime is a daily property.
  const hoursByEmployee = new Map<string, number>();
  for (const iv of intervals) {
    hoursByEmployee.set(iv.employee_id, (hoursByEmployee.get(iv.employee_id) ?? 0) + iv.hours);
  }

  // employee|station|ot → hours
  const bucket = new Map<string, { employee_id: string; station_id: string | null; ot_id: string; hours: number }>();
  let unattributedHours = 0;

  for (const iv of intervals) {
    const key = `${iv.employee_id}::${iv.station_id ?? ''}`;
    const otIds = iv.station_id ? assignmentIndex.get(key) ?? [] : [];

    if (otIds.length === 0) {
      unattributedHours += iv.hours;
      allWarnings.push({
        code: 'no_assignment',
        employee_id: iv.employee_id,
        detail: `${iv.hours} h marcadas sin una OT asignada en esa estación; no se cargaron a ninguna orden.`,
      });
      continue;
    }

    const share = iv.hours / otIds.length;
    for (const otId of otIds) {
      const bKey = `${iv.employee_id}::${iv.station_id ?? ''}::${otId}`;
      const existing = bucket.get(bKey);
      if (existing) existing.hours += share;
      else
        bucket.set(bKey, {
          employee_id: iv.employee_id,
          station_id: iv.station_id,
          ot_id: otId,
          hours: share,
        });
    }
  }

  const lines: LaborLine[] = [];
  const seenNoRate = new Set<string>();

  for (const entry of bucket.values()) {
    const rate = rateOn(input.rates, entry.employee_id, input.date);
    if (!rate) {
      if (!seenNoRate.has(entry.employee_id)) {
        seenNoRate.add(entry.employee_id);
        allWarnings.push({
          code: 'no_rate',
          employee_id: entry.employee_id,
          detail:
            'Sin tarifa vigente a esa fecha; sus horas no se pudieron costear. Completa su ficha en Personas.',
        });
      }
      unattributedHours += entry.hours;
      continue;
    }

    const dayTotal = hoursByEmployee.get(entry.employee_id) ?? entry.hours;
    const { regular: dayRegular, overtime: dayOvertime } = splitOvertime(
      dayTotal,
      opts.baseHoursPerDay
    );

    // Spread the day's regular/overtime split across this line proportionally.
    const proportion = dayTotal > 0 ? entry.hours / dayTotal : 0;
    const regularHours = round2(dayRegular * proportion);
    const overtimeHours = round2(dayOvertime * proportion);

    const multiplier = rate.overtime_multiplier_50 ?? opts.defaultOvertimeMultiplier;
    const cost = regularHours * rate.hourly_rate + overtimeHours * rate.hourly_rate * multiplier;

    lines.push({
      ot_id: entry.ot_id,
      employee_id: entry.employee_id,
      station_id: entry.station_id,
      hours: round2(entry.hours),
      regularHours,
      overtimeHours,
      hourlyRate: rate.hourly_rate,
      currency: rate.currency_code || 'CLP',
      cost: round2(cost),
    });
  }

  // Stable order so a re-run posts identical rows.
  lines.sort(
    (a, b) =>
      a.ot_id.localeCompare(b.ot_id) ||
      a.employee_id.localeCompare(b.employee_id) ||
      String(a.station_id).localeCompare(String(b.station_id))
  );

  return { lines, warnings: allWarnings, unattributedHours: round2(unattributedHours) };
}

/** Group costed lines by OT — the shape the posting route writes. */
export function groupLinesByOt(lines: LaborLine[]): Map<string, LaborLine[]> {
  const byOt = new Map<string, LaborLine[]>();
  for (const line of lines) {
    const list = byOt.get(line.ot_id) ?? [];
    list.push(line);
    byOt.set(line.ot_id, list);
  }
  return byOt;
}

/**
 * Deterministic operation code for a labour line.
 * Same day + employee + station always yields the same code, which is what makes
 * re-posting a day idempotent instead of duplicating cost.
 */
export function laborOperationCode(date: string, employeeId: string, stationId: string | null): string {
  return `LABOR-${date}-${employeeId.slice(0, 8)}${stationId ? `-${stationId.slice(0, 8)}` : ''}`;
}

import { describe, it, expect } from 'vitest';
import {
  pairClockEvents,
  attributeLabor,
  rateOn,
  splitOvertime,
  laborOperationCode,
  groupLinesByOt,
  type ClockEvent,
  type AssignmentRow,
  type RateRow,
} from '../labor-attribution';

const EMP = '11111111-1111-1111-1111-111111111111';
const EMP2 = '22222222-2222-2222-2222-222222222222';
const STATION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STATION2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OT2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DATE = '2026-07-20';

const clock = (
  employee_id: string,
  event_type: 'clock_in' | 'clock_out',
  at: string,
  station_id: string | null = STATION
): ClockEvent => ({ employee_id, event_type, at, station_id });

const assignment = (
  employee_id: string,
  workstation_id: string,
  ot_id: string | null,
  date = DATE
): AssignmentRow => ({ employee_id, workstation_id, ot_id, date });

const rate = (employee_id: string, hourly_rate: number, extra: Partial<RateRow> = {}): RateRow => ({
  employee_id,
  hourly_rate,
  currency_code: 'CLP',
  overtime_multiplier_50: 1.5,
  effective_from: '2020-01-01',
  effective_to: null,
  ...extra,
});

describe('pairClockEvents', () => {
  it('pairs a normal in/out into one interval', () => {
    const { intervals, warnings } = pairClockEvents([
      clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
      clock(EMP, 'clock_out', '2026-07-20T20:00:00.000Z'),
    ]);

    expect(intervals).toHaveLength(1);
    expect(intervals[0].hours).toBe(8);
    expect(intervals[0].inferredEnd).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it('caps a forgotten clock-out and flags it as inferred', () => {
    const { intervals, warnings } = pairClockEvents(
      [clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z')],
      { maxShiftHours: 12 }
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0].hours).toBe(12);
    expect(intervals[0].inferredEnd).toBe(true);
    expect(warnings.map((w) => w.code)).toContain('no_clock_out');
  });

  it('closes the previous stint when an operator moves machine without clocking out', () => {
    const { intervals } = pairClockEvents([
      clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z', STATION),
      clock(EMP, 'clock_in', '2026-07-20T15:00:00.000Z', STATION2),
      clock(EMP, 'clock_out', '2026-07-20T18:00:00.000Z', STATION2),
    ]);

    expect(intervals).toHaveLength(2);
    expect(intervals[0].station_id).toBe(STATION);
    expect(intervals[0].hours).toBe(3);
    expect(intervals[1].station_id).toBe(STATION2);
    expect(intervals[1].hours).toBe(3);
  });

  it('reports a clock-out with no matching clock-in instead of dropping it', () => {
    const { intervals, warnings } = pairClockEvents([
      clock(EMP, 'clock_out', '2026-07-20T18:00:00.000Z'),
    ]);

    expect(intervals).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('unmatched_clock_out');
  });

  it('handles a night shift crossing midnight', () => {
    const { intervals } = pairClockEvents([
      clock(EMP, 'clock_in', '2026-07-20T22:00:00.000Z'),
      clock(EMP, 'clock_out', '2026-07-21T06:00:00.000Z'),
    ]);

    expect(intervals).toHaveLength(1);
    expect(intervals[0].hours).toBe(8);
  });

  it('keeps employees independent of each other', () => {
    const { intervals } = pairClockEvents([
      clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
      clock(EMP2, 'clock_in', '2026-07-20T13:00:00.000Z'),
      clock(EMP, 'clock_out', '2026-07-20T16:00:00.000Z'),
      clock(EMP2, 'clock_out', '2026-07-20T17:00:00.000Z'),
    ]);

    expect(intervals).toHaveLength(2);
    expect(intervals.find((i) => i.employee_id === EMP)!.hours).toBe(4);
    expect(intervals.find((i) => i.employee_id === EMP2)!.hours).toBe(4);
  });
});

describe('rateOn', () => {
  const rates: RateRow[] = [
    rate(EMP, 3000, { effective_from: '2024-01-01', effective_to: '2025-12-31' }),
    rate(EMP, 4500, { effective_from: '2026-01-01', effective_to: null }),
  ];

  it('picks the rate in force on the date', () => {
    expect(rateOn(rates, EMP, '2026-07-20')!.hourly_rate).toBe(4500);
    expect(rateOn(rates, EMP, '2025-06-01')!.hourly_rate).toBe(3000);
  });

  it('returns null when no rate covers the date', () => {
    expect(rateOn(rates, EMP, '2023-01-01')).toBeNull();
    expect(rateOn(rates, EMP2, '2026-07-20')).toBeNull();
  });
});

describe('splitOvertime', () => {
  it('leaves a normal day entirely regular', () => {
    expect(splitOvertime(8, 9)).toEqual({ regular: 8, overtime: 0 });
  });

  it('splits hours beyond the base into overtime', () => {
    expect(splitOvertime(11, 9)).toEqual({ regular: 9, overtime: 2 });
  });
});

describe('attributeLabor', () => {
  it('costs a plain day against the assigned OT', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T20:00:00.000Z'),
      ],
      assignments: [assignment(EMP, STATION, OT)],
      rates: [rate(EMP, 4500)],
    });

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.ot_id).toBe(OT);
    expect(line.hours).toBe(8);
    expect(line.overtimeHours).toBe(0);
    expect(line.cost).toBe(36000); // 8 × 4500
    expect(result.unattributedHours).toBe(0);
  });

  it('applies the overtime multiplier beyond the base day', () => {
    const result = attributeLabor(
      {
        date: DATE,
        events: [
          clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
          clock(EMP, 'clock_out', '2026-07-20T23:00:00.000Z'), // 11 h
        ],
        assignments: [assignment(EMP, STATION, OT)],
        rates: [rate(EMP, 1000, { overtime_multiplier_50: 1.5 })],
      },
      { baseHoursPerDay: 9 }
    );

    const line = result.lines[0];
    expect(line.regularHours).toBe(9);
    expect(line.overtimeHours).toBe(2);
    // 9×1000 + 2×1000×1.5 = 12000
    expect(line.cost).toBe(12000);
  });

  it('splits hours evenly when a station ran several OTs that day', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T20:00:00.000Z'), // 8 h
      ],
      assignments: [assignment(EMP, STATION, OT), assignment(EMP, STATION, OT2)],
      rates: [rate(EMP, 1000)],
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].hours).toBe(4);
    expect(result.lines[1].hours).toBe(4);
    const total = result.lines.reduce((s, l) => s + l.cost, 0);
    expect(total).toBe(8000);
  });

  it('does not charge any OT for hours with no assignment', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T17:00:00.000Z'),
      ],
      assignments: [],
      rates: [rate(EMP, 1000)],
    });

    expect(result.lines).toHaveLength(0);
    expect(result.unattributedHours).toBe(5);
    expect(result.warnings.map((w) => w.code)).toContain('no_assignment');
  });

  it('refuses to invent a cost for someone with no rate', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T16:00:00.000Z'),
      ],
      assignments: [assignment(EMP, STATION, OT)],
      rates: [], // the "fdf" / "Ñaño" case: a person with no compensation row
    });

    expect(result.lines).toHaveLength(0);
    expect(result.unattributedHours).toBe(4);
    expect(result.warnings.map((w) => w.code)).toContain('no_rate');
  });

  it('ignores assignments from other dates', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T16:00:00.000Z'),
      ],
      assignments: [assignment(EMP, STATION, OT, '2026-07-19')],
      rates: [rate(EMP, 1000)],
    });

    expect(result.lines).toHaveLength(0);
    expect(result.unattributedHours).toBe(4);
  });

  it('is deterministic — same input yields identical lines', () => {
    const input = {
      date: DATE,
      events: [
        clock(EMP2, 'clock_in', '2026-07-20T12:00:00.000Z', STATION2),
        clock(EMP2, 'clock_out', '2026-07-20T18:00:00.000Z', STATION2),
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T18:00:00.000Z'),
      ],
      assignments: [assignment(EMP, STATION, OT), assignment(EMP2, STATION2, OT)],
      rates: [rate(EMP, 1000), rate(EMP2, 2000)],
    };

    expect(attributeLabor(input)).toEqual(attributeLabor(input));
  });

  it('groups lines by OT for posting', () => {
    const result = attributeLabor({
      date: DATE,
      events: [
        clock(EMP, 'clock_in', '2026-07-20T12:00:00.000Z'),
        clock(EMP, 'clock_out', '2026-07-20T18:00:00.000Z'),
        clock(EMP2, 'clock_in', '2026-07-20T12:00:00.000Z', STATION2),
        clock(EMP2, 'clock_out', '2026-07-20T18:00:00.000Z', STATION2),
      ],
      assignments: [assignment(EMP, STATION, OT), assignment(EMP2, STATION2, OT2)],
      rates: [rate(EMP, 1000), rate(EMP2, 1000)],
    });

    const grouped = groupLinesByOt(result.lines);
    expect(grouped.size).toBe(2);
    expect(grouped.get(OT)).toHaveLength(1);
    expect(grouped.get(OT2)).toHaveLength(1);
  });
});

describe('laborOperationCode', () => {
  it('is stable for the same day/employee/station — the basis of idempotent posting', () => {
    const a = laborOperationCode(DATE, EMP, STATION);
    const b = laborOperationCode(DATE, EMP, STATION);
    expect(a).toBe(b);
    expect(a.startsWith('LABOR-2026-07-20')).toBe(true);
  });

  it('differs across employees and stations', () => {
    expect(laborOperationCode(DATE, EMP, STATION)).not.toBe(laborOperationCode(DATE, EMP2, STATION));
    expect(laborOperationCode(DATE, EMP, STATION)).not.toBe(laborOperationCode(DATE, EMP, STATION2));
  });
});

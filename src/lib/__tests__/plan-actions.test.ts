import { describe, expect, it } from 'vitest';
import { plantWallClockToMs, workingHoursBetween } from '../plant-calendar';
import type { RemainingStep } from '../production-route';
import { buildSchedule, lanesForStep, type SchedOT } from '../production-scheduler';
import { landingSlot } from '../plan-actions';

const NOW = plantWallClockToMs(2026, 10, 27, 7 * 60);
const H = 3_600_000;

const MACHINES = [
  { id: 'g1', name: 'Guillotina #1', type: 'guillotine' },
  { id: 'g2', name: 'Guillotina #2', type: 'guillotine' },
  { id: 'offset1', name: 'Ryobi #1', type: 'offset_printer' },
];
const step = (key: RemainingStep['key'], hours: number): RemainingStep => ({
  key, hours, estimatedHours: hours, quoteHours: hours, source: 'presupuesto', inProgress: false,
});
const ot = (id: string, steps: RemainingStep[]): SchedOT => ({ id, ot_number: id, status: 'in_storage', steps });

describe('landingSlot: dónde cae una etapa movida (Gantt y panel del teléfono)', () => {
  const s = buildSchedule({ now: NOW, machines: MACHINES, pins: [], ots: [ot('A', [step('corte_inicial', 3)])] });
  const block = s.blocks[0];
  const from = s.lanes.find((l) => l.id === block.laneId)!;
  const other = lanesForStep(s.lanes, 'corte_inicial').find((l) => l.id !== from.id)!;

  it('a otra guillotina, la misma cantidad de horas de trabajo', () => {
    const { start, end } = landingSlot({ block, fromLane: from, toLane: other, wantedStart: NOW + 24 * H, now: NOW });
    expect(workingHoursBetween(other.calendar, start, end)).toBeCloseTo(3, 5);
  });

  it('nunca en el pasado: pedir ayer cae en el próximo instante hábil desde ahora', () => {
    const { start } = landingSlot({ block, fromLane: from, toLane: other, wantedStart: NOW - 48 * H, now: NOW });
    expect(start).toBeGreaterThanOrEqual(NOW);
  });

  it('se alinea a cuartos de hora', () => {
    const { start } = landingSlot({ block, fromLane: from, toLane: other, wantedStart: NOW + 26 * H + 7 * 60_000, now: NOW });
    expect(start % (15 * 60_000)).toBe(0);
  });

  it('una etapa fijada conserva las horas hábiles que tenía', () => {
    const pinned = { ...block, pinned: true, start: NOW + 2 * H, end: NOW + 4 * H };
    const had = workingHoursBetween(from.calendar, pinned.start, pinned.end);
    const { start, end } = landingSlot({ block: pinned, fromLane: from, toLane: other, wantedStart: NOW + 30 * H, now: NOW });
    expect(workingHoursBetween(other.calendar, start, end)).toBeCloseTo(had, 5);
  });
});

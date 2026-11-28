/**
 * Moving, releasing and re-timing a stage of the production plan — one place.
 *
 * The Gantt does it by dragging; the phone (PlanMovil) does it from a stage
 * panel. Both must compute the same landing slot and write through the same
 * route, or the plan has two editors that disagree (golden thread). This
 * module is the pure half: where and for how long a stage lands when it is
 * moved. The writes live in usePlanActions (src/hooks/use-plan-actions.ts).
 */

import { addWorkingHours, nextWorkingInstant, workingHoursBetween } from '@/lib/plant-calendar';
import { setupFor, type Block, type Lane } from '@/lib/production-scheduler';

/** Smallest unit a stage is placed on: a quarter of an hour. */
export const SNAP_H = 0.25;
const HOUR_MS = 3_600_000;

/**
 * Where a stage lands if moved to `lane`, starting no earlier than `wantedStart`.
 *
 * - The press make-ready changes with the machine: the origin's is taken out
 *   and the destination's put in (unless make-ready is already done).
 * - A pinned stage keeps the working hours it had.
 * - The start is the next working instant of the destination's calendar,
 *   never in the past.
 */
export function landingSlot(args: {
  block: Block;
  fromLane: Lane;
  toLane: Lane;
  wantedStart: number;
  now: number;
  /** The OT's own make-ready correction, if any (`ots.ajuste_minutes`). */
  otAjusteMinutes?: number | null;
}): { start: number; end: number } {
  const { block, fromLane, toLane, wantedStart, now, otAjusteMinutes } = args;
  const setupHere = block.setupDone ? 0 : setupFor(toLane, block.setupColors, otAjusteMinutes).hours;
  const durationH = block.pinned
    ? workingHoursBetween(fromLane.calendar, block.start, block.end)
    : block.hours - block.delayHours - block.setupHours + setupHere;
  const snap = SNAP_H * HOUR_MS;
  const start = nextWorkingInstant(toLane.calendar, Math.max(Math.round(wantedStart / snap) * snap, now));
  const end = addWorkingHours(toLane.calendar, start, Math.max(durationH, SNAP_H));
  return { start, end };
}

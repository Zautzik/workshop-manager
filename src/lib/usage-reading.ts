/**
 * Is a counter reading physically possible? (audit H1, 2026-11-25)
 *
 * The Roland 300 read 25,019,831 "hours" — an impression count copied into an
 * hour-metered machine. Usage-based maintenance would fire on it. A reading
 * cannot grow faster than its unit can accumulate in the time since the last
 * one: a machine runs at most 24 h in a day, a sheet-fed press does not pass
 * ~15,000 sheets an hour.
 *
 * Going BACKWARDS stays allowed with a warning (meters get replaced and reset),
 * as before. This only stops an impossible jump forward.
 *
 * Pure: the route reads the previous reading and calls this.
 */

import type { MachineUsageUnit } from '@/types/machine-usage-unit';
import { usageUnitInline } from '@/types/machine-usage-unit';

/** Most a unit can accumulate per day of wall-clock time. Generous on purpose. */
export const MAX_PER_DAY: Record<MachineUsageUnit, number> = {
  hours: 24,
  impressions: 15_000 * 24,
  kilometers: 1_500,
  cycles: 1_000_000,
};

/** Upper bound for a FIRST reading (no previous one to compare with). */
export const MAX_FIRST_READING: Record<MachineUsageUnit, number> = {
  hours: 200_000, // ~23 years running day and night
  impressions: 1_000_000_000,
  kilometers: 2_000_000,
  cycles: 10_000_000_000,
};

const DAY_MS = 86_400_000;

export interface PreviousReading {
  reading: number;
  read_at: string;
}

export function checkUsageReading(args: {
  unit: string;
  reading: number;
  readAt: string;
  previous: PreviousReading | null;
}): { ok: true } | { ok: false; error: string } {
  const unit = (args.unit in MAX_PER_DAY ? args.unit : 'hours') as MachineUsageUnit;
  const name = usageUnitInline(unit);
  const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');

  if (!args.previous) {
    if (args.reading > MAX_FIRST_READING[unit]) {
      return { ok: false, error: `${fmt(args.reading)} ${name} no es una lectura posible para esta máquina (máximo ${fmt(MAX_FIRST_READING[unit])}). ¿Es la unidad correcta?` };
    }
    return { ok: true };
  }

  const delta = args.reading - args.previous.reading;
  if (delta <= 0) return { ok: true }; // backwards or equal: allowed, the route warns

  const days = Math.max(0, (Date.parse(args.readAt) - Date.parse(args.previous.read_at)) / DAY_MS);
  // At least one day of allowance, so two readings minutes apart still work.
  const allowed = MAX_PER_DAY[unit] * Math.max(1, days);
  if (delta > allowed) {
    return {
      ok: false,
      error:
        `Subió ${fmt(delta)} ${name} desde la lectura anterior (${fmt(args.previous.reading)}), ` +
        `y en ${days < 1 ? 'menos de un día' : `${Math.round(days)} días`} no se pueden acumular más de ${fmt(allowed)}. ` +
        'Revisa el número y que la máquina use la unidad correcta.',
    };
  }
  return { ok: true };
}

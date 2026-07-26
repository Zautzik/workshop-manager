/**
 * What an hour on this machine actually costs.
 *
 * The plant carried two answers to that question and never compared them:
 *   · `machines` knows energy_cost_per_hr, maintenance_cost_monthly,
 *     depreciation_monthly, power_kw — the real economics of the iron.
 *   · the costing catalog carries a press hourly rate (engine fallback
 *     $55.000/h) that someone typed once.
 *
 * Nobody reconciled them, so a quote could drift from reality with no signal.
 * This module derives the rate from the machine's own numbers and reports the
 * drift against the catalog, so the difference becomes visible instead of silent.
 *
 * Pure — no I/O, no Supabase — so it can be unit-tested like the attribution
 * engine and reused by both the machine profile and the costing resolver.
 */

export interface MachineEconomics {
  energy_cost_per_hr?: number | null;
  maintenance_cost_monthly?: number | null;
  depreciation_monthly?: number | null;
  power_kw?: number | null;
}

export interface DerivedRate {
  /** Cost per productive hour, in the same currency the fields are stored in. */
  hourly: number;
  /** The pieces, so the profile can show the breakdown rather than one number. */
  breakdown: {
    energy: number;
    maintenance: number;
    depreciation: number;
  };
  /** Monthly productive hours the fixed costs were spread over. */
  monthlyHours: number;
  /** False when the machine lacks the data to say anything honest. */
  complete: boolean;
  /** Which fields were missing — shown to whoever must fill them in. */
  missing: string[];
}

/**
 * Productive hours in a month, used to prorate the fixed costs.
 * A single shift, 5 days: 9 h × 5 × 4.33 weeks ≈ 195. Deliberately conservative:
 * spreading fixed cost over fewer hours makes the hour look more expensive, and
 * under-quoting is the failure that actually hurts a print shop.
 */
export const DEFAULT_MONTHLY_PRODUCTIVE_HOURS = 195;

export function deriveMachineHourlyCost(
  machine: MachineEconomics | null | undefined,
  monthlyHours: number = DEFAULT_MONTHLY_PRODUCTIVE_HOURS
): DerivedRate {
  const hours = monthlyHours > 0 ? monthlyHours : DEFAULT_MONTHLY_PRODUCTIVE_HOURS;

  const energy = Number(machine?.energy_cost_per_hr ?? 0) || 0;
  const maintenanceMonthly = Number(machine?.maintenance_cost_monthly ?? 0) || 0;
  const depreciationMonthly = Number(machine?.depreciation_monthly ?? 0) || 0;

  const missing: string[] = [];
  if (machine?.energy_cost_per_hr == null) missing.push('energy_cost_per_hr');
  if (machine?.maintenance_cost_monthly == null) missing.push('maintenance_cost_monthly');
  if (machine?.depreciation_monthly == null) missing.push('depreciation_monthly');

  const maintenance = maintenanceMonthly / hours;
  const depreciation = depreciationMonthly / hours;
  const hourly = energy + maintenance + depreciation;

  return {
    hourly: round2(hourly),
    breakdown: {
      energy: round2(energy),
      maintenance: round2(maintenance),
      depreciation: round2(depreciation),
    },
    monthlyHours: hours,
    // Energy alone isn't a cost per hour of ownership; require at least one
    // fixed component too, or the derived rate flatters the machine.
    complete: missing.length === 0,
    missing,
  };
}

export interface RateDrift {
  catalog: number;
  derived: number;
  /** Positive = the machine really costs more than the catalog says. */
  deltaPct: number | null;
  /** True when the gap is big enough that a quote would be visibly wrong. */
  material: boolean;
  direction: 'under' | 'over' | 'aligned';
}

/** Gap at which the catalog rate stops being a rounding difference. */
export const DRIFT_TOLERANCE_PCT = 10;

export function compareToCatalog(
  derivedHourly: number,
  catalogHourly: number,
  tolerancePct: number = DRIFT_TOLERANCE_PCT
): RateDrift {
  if (!catalogHourly || catalogHourly <= 0) {
    return {
      catalog: catalogHourly,
      derived: derivedHourly,
      deltaPct: null,
      material: false,
      direction: 'aligned',
    };
  }

  const deltaPct = ((derivedHourly - catalogHourly) / catalogHourly) * 100;
  const material = Math.abs(deltaPct) > tolerancePct;

  return {
    catalog: round2(catalogHourly),
    derived: round2(derivedHourly),
    deltaPct: Math.round(deltaPct * 10) / 10,
    material,
    // 'under' = we are charging less than the machine costs — the dangerous side.
    direction: !material ? 'aligned' : deltaPct > 0 ? 'under' : 'over',
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

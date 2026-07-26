import { describe, it, expect } from 'vitest';
import {
  deriveMachineHourlyCost,
  compareToCatalog,
  DEFAULT_MONTHLY_PRODUCTIVE_HOURS,
} from '../machine-economics';

describe('deriveMachineHourlyCost', () => {
  it('spreads fixed monthly costs over productive hours and adds energy', () => {
    const r = deriveMachineHourlyCost(
      {
        energy_cost_per_hr: 1000,
        maintenance_cost_monthly: 195000,
        depreciation_monthly: 390000,
      },
      195
    );

    expect(r.breakdown.energy).toBe(1000);
    expect(r.breakdown.maintenance).toBe(1000); // 195.000 / 195
    expect(r.breakdown.depreciation).toBe(2000); // 390.000 / 195
    expect(r.hourly).toBe(4000);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('flags an incomplete machine instead of quietly under-reporting', () => {
    const r = deriveMachineHourlyCost({ energy_cost_per_hr: 1200 });

    expect(r.complete).toBe(false);
    expect(r.missing).toContain('maintenance_cost_monthly');
    expect(r.missing).toContain('depreciation_monthly');
    // Still returns what it knows, so the profile can show a partial figure.
    expect(r.hourly).toBe(1200);
  });

  it('treats a machine with no economics as zero, not NaN', () => {
    const r = deriveMachineHourlyCost(null);
    expect(r.hourly).toBe(0);
    expect(r.complete).toBe(false);
    expect(Number.isNaN(r.hourly)).toBe(false);
  });

  it('falls back to the default when given nonsense hours', () => {
    const r = deriveMachineHourlyCost({ maintenance_cost_monthly: 195000 }, 0);
    expect(r.monthlyHours).toBe(DEFAULT_MONTHLY_PRODUCTIVE_HOURS);
  });

  it('fewer productive hours make the hour more expensive', () => {
    const base = { maintenance_cost_monthly: 100000, depreciation_monthly: 100000 };
    const busy = deriveMachineHourlyCost(base, 200);
    const quiet = deriveMachineHourlyCost(base, 100);
    expect(quiet.hourly).toBeGreaterThan(busy.hourly);
  });
});

describe('compareToCatalog', () => {
  it('reports alignment inside the tolerance', () => {
    const d = compareToCatalog(52000, 55000);
    expect(d.material).toBe(false);
    expect(d.direction).toBe('aligned');
  });

  it('flags under-charging — the dangerous direction', () => {
    const d = compareToCatalog(61200, 55000);
    expect(d.deltaPct).toBeCloseTo(11.3, 1);
    expect(d.material).toBe(true);
    expect(d.direction).toBe('under');
  });

  it('flags over-charging too', () => {
    const d = compareToCatalog(40000, 55000);
    expect(d.material).toBe(true);
    expect(d.direction).toBe('over');
  });

  it('does not divide by a missing catalog rate', () => {
    const d = compareToCatalog(50000, 0);
    expect(d.deltaPct).toBeNull();
    expect(d.material).toBe(false);
  });
});

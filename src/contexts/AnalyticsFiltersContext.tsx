'use client';
/**
 * Shared analytics "spine": a single period + comparison window that every
 * Analítica section reads from, so date ranges and period-over-period deltas are
 * consistent across the module (instead of each screen inventing its own — or
 * hardcoding fake +12% figures).
 */
import { createContext, useContext, useMemo, useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfYear, subMonths, subDays, subYears,
} from 'date-fns';

export type RangePreset = 'this_month' | 'last_month' | 'last_30_days' | 'last_3_months' | 'this_year';
export type Granularity = 'day' | 'week' | 'month';

export interface Period {
  from: Date;
  to: Date;
}

export interface AnalyticsFiltersValue {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  range: Period;
  /** The immediately-preceding window of equal length, for deltas. */
  comparison: Period;
  granularity: Granularity;
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  this_month: 'Este mes',
  last_month: 'Mes anterior',
  last_30_days: 'Últimos 30 días',
  last_3_months: 'Últimos 3 meses',
  this_year: 'Este año',
};

/** Resolve a preset to its current window, comparison window, and granularity. */
export function resolvePreset(preset: RangePreset, now = new Date()): {
  range: Period; comparison: Period; granularity: Granularity;
} {
  switch (preset) {
    case 'last_month': {
      const ref = subMonths(now, 1);
      const range = { from: startOfMonth(ref), to: endOfMonth(ref) };
      const prev = subMonths(ref, 1);
      return {
        range,
        comparison: { from: startOfMonth(prev), to: endOfMonth(prev) },
        granularity: 'day',
      };
    }
    case 'last_30_days': {
      const range = { from: subDays(now, 30), to: now };
      return {
        range,
        comparison: { from: subDays(now, 60), to: subDays(now, 30) },
        granularity: 'day',
      };
    }
    case 'last_3_months': {
      const range = { from: subMonths(now, 3), to: now };
      return {
        range,
        comparison: { from: subMonths(now, 6), to: subMonths(now, 3) },
        granularity: 'week',
      };
    }
    case 'this_year': {
      const range = { from: startOfYear(now), to: now };
      const prevStart = startOfYear(subYears(now, 1));
      return {
        range,
        comparison: { from: prevStart, to: subYears(now, 1) },
        granularity: 'month',
      };
    }
    case 'this_month':
    default: {
      const range = { from: startOfMonth(now), to: now };
      const prev = subMonths(now, 1);
      return {
        range,
        comparison: { from: startOfMonth(prev), to: endOfMonth(prev) },
        granularity: 'day',
      };
    }
  }
}

const AnalyticsFiltersContext = createContext<AnalyticsFiltersValue | null>(null);

export function AnalyticsFiltersProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPreset] = useState<RangePreset>('this_month');

  const value = useMemo<AnalyticsFiltersValue>(() => {
    const { range, comparison, granularity } = resolvePreset(preset);
    return { preset, setPreset, range, comparison, granularity };
  }, [preset]);

  return (
    <AnalyticsFiltersContext.Provider value={value}>
      {children}
    </AnalyticsFiltersContext.Provider>
  );
}

export function useAnalyticsFilters(): AnalyticsFiltersValue {
  const ctx = useContext(AnalyticsFiltersContext);
  if (!ctx) {
    throw new Error('useAnalyticsFilters must be used within an AnalyticsFiltersProvider');
  }
  return ctx;
}

/**
 * Like useAnalyticsFilters but tolerant of being rendered outside a provider —
 * falls back to the default "this month" window. Lets shared components (e.g.
 * ExecutiveOverview, used both inside Analítica and on the legacy admin page)
 * compute deltas without hard-requiring the provider.
 */
export function useAnalyticsFiltersOptional(): AnalyticsFiltersValue {
  const ctx = useContext(AnalyticsFiltersContext);
  const fallback = useMemo<AnalyticsFiltersValue>(() => {
    const { range, comparison, granularity } = resolvePreset('this_month');
    return { preset: 'this_month', setPreset: () => {}, range, comparison, granularity };
  }, []);
  return ctx ?? fallback;
}

// ─── Period math helpers (shared by sections) ───────────────────────────────

export function inPeriod(dateStr: string | null | undefined, period: Period): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t >= period.from.getTime() && t <= period.to.getTime();
}

/** Percentage change from previous → current. Null when there's no base to compare. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

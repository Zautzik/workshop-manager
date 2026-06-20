'use client';
import { CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useAnalyticsFilters, PRESET_LABELS, type RangePreset,
} from '@/contexts/AnalyticsFiltersContext';

const ORDER: RangePreset[] = ['this_month', 'last_month', 'last_30_days', 'last_3_months', 'this_year'];

/**
 * Sticky control bar shared by every Analítica section. Picks the period; the
 * readout shows the active window and confirms deltas are vs the prior window.
 */
export default function AnalyticsFilterBar() {
  const { preset, setPreset, range, comparison } = useAnalyticsFilters();

  const fmt = (d: Date) => format(d, 'd MMM', { locale: es });
  const fmtY = (d: Date) => format(d, 'd MMM yyyy', { locale: es });

  return (
    <div className="sticky top-0 z-20 -mx-6 mb-2 border-b border-border bg-background/80 px-6 py-2.5 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER.map((p) => (
                <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          {fmtY(range.from)} – {fmtY(range.to)}
        </span>

        <span className="text-xs text-muted-foreground/70 hidden sm:inline">
          vs {fmt(comparison.from)} – {fmt(comparison.to)}
        </span>
      </div>
    </div>
  );
}

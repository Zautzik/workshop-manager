import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CLASSES, type KpiCardProps } from '@/components/ui/kpi-card';

/**
 * A row of figures in one slim bar (plan 2026-11-25, F2).
 *
 * KpiCard gives each number its own ~110 px card; four of them, often reading
 * "0", took the first screen of Mantenimiento, Compras and Despachos before any
 * real content (audit M5). For plain counts and amounts this bar says the same
 * in ~60 px: two figures per row on a phone, all in one row from `sm`.
 *
 * `hideWhenZero` drops a figure that has nothing to say ("Órdenes próximas 0").
 * If every figure is hidden, `allClear` is shown instead, so the bar never
 * renders empty.
 *
 * KpiCard stays for figures that carry a chart or extra content.
 */
export interface Stat {
  label: string;
  value: string;
  /** The raw number, used by hideWhenZero. */
  count?: number;
  hint?: string;
  icon?: LucideIcon;
  tone?: KpiCardProps['tone'];
  hideWhenZero?: boolean;
}

export function StatsBar({ stats, allClear, className }: { stats: Stat[]; allClear?: string; className?: string }) {
  const shown = stats.filter((s) => !(s.hideWhenZero && (s.count ?? Number(s.value)) === 0));
  if (shown.length === 0) {
    return allClear ? (
      <div className={cn('rounded-lg border bg-card/60 px-4 py-2.5 text-sm text-muted-foreground', className)}>{allClear}</div>
    ) : null;
  }
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:flex sm:flex-wrap',
        className,
      )}
    >
      {shown.map((s) => {
        const tone = TONE_CLASSES[s.tone ?? 'default'];
        const Icon = s.icon;
        return (
          <div key={s.label} className="min-w-0 bg-card px-3 py-2 sm:flex-1 sm:px-4">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', s.tone && s.tone !== 'default' && tone.text)} />}
              {s.label}
            </p>
            <p className={cn('break-words text-lg font-bold tabular-nums leading-tight', s.tone !== 'default' && tone.text)}>{s.value}</p>
            {s.hint && <p className="truncate text-[11px] text-muted-foreground">{s.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

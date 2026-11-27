'use client';

/**
 * Planificación on a phone (owner's choice 2026-11-26: B + C + D + stage panel).
 *
 * The Gantt cannot be used at 390 px, so below `md` the Cronograma tab shows
 * three views of the SAME plan (useProductionSchedule → buildSchedule):
 *   - Ahora:      per machine, what runs now and what is next, risk first (C).
 *   - Carga:      machines × next 7 working days, coloured by % of capacity (B).
 *   - En riesgo:  OTs whose projected end passes their deadline, or blocked (D).
 * Tapping any stage opens StagePanel, which does with buttons what the Gantt
 * does by dragging — through the same writer (usePlanActions) and the same
 * landing rule (landingSlot). Nothing here is a second way to edit the plan.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Clock, Gauge, Pin, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProductionSchedule } from '@/hooks/use-production-schedule';
import { plantParts, plantWallClockToMs, workingHoursBetween } from '@/lib/plant-calendar';
import { formatPlantDateTime, formatPlantDay, formatPlantRange, formatPlantTime, formatSpan } from '@/lib/production-plan';
import { PLAN_STEP_BY_KEY } from '@/lib/production-route';
import type { Block, Lane } from '@/lib/production-scheduler';
import { cn } from '@/lib/utils';
import { StagePanel } from './StagePanel';

type View = 'ahora' | 'carga' | 'riesgo';
const DAYS = 7;

function dayStart(base: number, offset: number): number {
  const p = plantParts(base);
  return plantWallClockToMs(p.year, p.month, p.day + offset, 0);
}

/** «18:40» today; «vie 27 nov · 07:52» when it ends on another day. */
function untilLabel(end: number, now: number): string {
  const a = plantParts(now);
  const b = plantParts(end);
  return a.year === b.year && a.month === b.month && a.day === b.day ? formatPlantTime(end) : formatPlantDateTime(end);
}

function loadTone(pct: number | null): string {
  if (pct == null) return 'bg-muted/40 text-muted-foreground/50';
  if (pct === 0) return 'bg-muted text-muted-foreground';
  if (pct < 60) return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  if (pct < 90) return 'bg-amber-500/25 text-amber-700 dark:text-amber-300';
  return 'bg-red-500/25 text-red-700 dark:text-red-300';
}

export function PlanMovil() {
  const { role } = useAuth();
  const canEdit = role === 'admin' || role === 'supervisor';
  const { schedule, plan, isLoading, isError, error, now, planNow } = useProductionSchedule();
  const [view, setView] = useState<View>('ahora');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Block | null>(null);
  const [cell, setCell] = useState<{ lane: Lane; day: number } | null>(null);

  const otById = useMemo(() => new Map((plan?.ots ?? []).map((o) => [o.id, o as any])), [plan]);
  const lanes = useMemo(
    () => (schedule ? schedule.lanes.filter((l) => !l.virtual || schedule.blocks.some((b) => b.laneId === l.id)) : []),
    [schedule],
  );
  const isLate = (otId: string) => (schedule?.projections.get(otId)?.lateHours ?? 0) > 0;
  const otLabel = (otId: string) => {
    const o = otById.get(otId);
    return o ? `${String(o.ot_number).replace(/^OT-?/i, '')}${o.client_name ? ` · ${o.client_name}` : ''}` : otId;
  };

  // C — now and next per machine, the ones with a late OT first.
  const ahora = useMemo(() => {
    if (!schedule) return [];
    return lanes
      .map((lane) => {
        const mine = schedule.blocks.filter((b) => b.laneId === lane.id).sort((a, b) => a.start - b.start);
        const current = mine.find((b) => b.start <= now && b.end > now) ?? null;
        const next = mine.find((b) => b.start > now) ?? null;
        const risk = [current, next].some((b) => b && (schedule.projections.get(b.otId)?.lateHours ?? 0) > 0);
        return { lane, current, next, risk };
      })
      .sort((a, b) => Number(b.risk) - Number(a.risk) || Number(!!b.current) - Number(!!a.current) || (a.next?.start ?? Infinity) - (b.next?.start ?? Infinity));
  }, [schedule, lanes, now]);

  // B — load per machine per day.
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => dayStart(planNow, weekOffset * DAYS + i)), [planNow, weekOffset]);
  const carga = useMemo(() => {
    if (!schedule) return [];
    return lanes.map((lane) => ({
      lane,
      cells: days.map((d0) => {
        const d1 = dayStart(d0, 1);
        const available = workingHoursBetween(lane.calendar, d0, d1);
        if (available <= 0) return { day: d0, pct: null as number | null };
        const used = schedule.blocks
          .filter((b) => b.laneId === lane.id && b.start < d1 && b.end > d0)
          .reduce((s, b) => s + workingHoursBetween(lane.calendar, Math.max(b.start, d0), Math.min(b.end, d1)), 0)
          + schedule.maintenance
            .filter((m) => m.laneId === lane.id && m.start < d1 && m.end > d0)
            .reduce((s, m) => s + workingHoursBetween(lane.calendar, Math.max(m.start, d0), Math.min(m.end, d1)), 0);
        return { day: d0, pct: Math.round((used / available) * 100) };
      }),
    }));
  }, [schedule, lanes, days]);

  // D — OTs projected late or blocked, the latest first.
  const riesgo = useMemo(() => {
    if (!schedule) return [];
    return [...schedule.projections.values()]
      .filter((p) => (p.lateHours ?? 0) > 0 || p.blocked)
      .sort((a, b) => (b.lateHours ?? 0) - (a.lateHours ?? 0));
  }, [schedule]);

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted/40" />;
  if (isError || !schedule) return <p className="text-sm text-destructive">{(error as Error)?.message ?? 'No se pudo cargar el programa.'}</p>;

  const cellBlocks = cell
    ? schedule.blocks.filter((b) => b.laneId === cell.lane.id && b.start < dayStart(cell.day, 1) && b.end > cell.day).sort((a, b) => a.start - b.start)
    : [];

  const tabs: Array<[View, string, typeof Clock, number | null]> = [
    ['ahora', 'Ahora', Clock, null],
    ['carga', 'Carga', Gauge, null],
    ['riesgo', 'Riesgo', ShieldAlert, riesgo.length],
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {tabs.map(([key, label, Icon, n]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn('flex h-10 items-center justify-center gap-1.5 rounded-md text-sm', view === key ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground')}
          >
            <Icon className="h-4 w-4" /> {label}
            {n ? <span className="rounded-full bg-red-500/15 px-1.5 text-xs font-semibold text-red-600">{n}</span> : null}
          </button>
        ))}
      </div>

      {view === 'ahora' && (
        <ul className="space-y-2">
          {ahora.map(({ lane, current, next, risk }) => (
            <li key={lane.id} className={cn('rounded-xl border bg-card p-3', risk && 'border-red-500/40')}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{lane.name}</span>
                {risk && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Con OT atrasada" />}
              </div>
              {[['Ahora', current], ['Después', next]].map(([label, b]) => (
                <button
                  key={label as string}
                  type="button"
                  disabled={!b}
                  onClick={() => b && setSelected(b as Block)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:hover:bg-transparent"
                >
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{label as string}</span>
                  {b ? (
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-medium', isLate((b as Block).otId) && 'text-red-600')}>{otLabel((b as Block).otId)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {PLAN_STEP_BY_KEY[(b as Block).step]?.label} · {label === 'Ahora' ? `hasta ${untilLabel((b as Block).end, now)}` : formatPlantRange((b as Block).start, (b as Block).end)}
                        {(b as Block).pinned && <Pin className="ml-1 inline h-3 w-3" />}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{label === 'Ahora' ? 'Libre' : 'Nada programado'}</span>
                  )}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}

      {view === 'carga' && (
        <div className="rounded-xl border bg-card p-2">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Semana anterior" disabled={weekOffset === 0} onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground">{formatPlantDay(days[0])} – {formatPlantDay(days[DAYS - 1])}</span>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Semana siguiente" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="w-[30%]" />
                {days.map((d) => (
                  <th key={d} className="font-normal text-muted-foreground">{formatPlantDay(d).split(' ').slice(0, 2).join(' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carga.map(({ lane, cells }) => (
                <tr key={lane.id}>
                  <td className="truncate pr-1 font-medium" title={lane.name}>{lane.name}</td>
                  {cells.map((c) => (
                    <td key={c.day} className="p-0">
                      <button
                        type="button"
                        disabled={c.pct == null}
                        onClick={() => setCell({ lane, day: c.day })}
                        className={cn('flex h-9 w-full items-center justify-center rounded tabular-nums', loadTone(c.pct))}
                        aria-label={`${lane.name}, ${formatPlantDay(c.day)}: ${c.pct == null ? 'sin turno' : `${c.pct}% de capacidad`}`}
                      >
                        {c.pct == null ? '·' : c.pct}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 px-1 text-xs text-muted-foreground">% de las horas de turno ocupadas. Toca una celda para ver y mover lo de ese día.</p>
        </div>
      )}

      {view === 'riesgo' && (
        riesgo.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-emerald-700 dark:text-emerald-400">Ninguna OT se proyecta atrasada.</p>
        ) : (
          <ul className="space-y-2">
            {riesgo.map((p) => {
              const firstBlock = schedule.blocks.filter((b) => b.otId === p.otId).sort((a, b) => a.start - b.start)[0];
              return (
                <li key={p.otId}>
                  <button
                    type="button"
                    disabled={!firstBlock}
                    onClick={() => firstBlock && setSelected(firstBlock)}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-muted/60"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{otLabel(p.otId)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.blocked ? `Bloqueada: ${p.blocked}` : `${formatSpan(p.lateHours ?? 0)} tarde`}
                        {p.end ? ` · termina ${formatPlantDay(p.end)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {cell && (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{cell.lane.name} · {formatPlantDay(cell.day)}</span>
            <button type="button" className="h-9 px-2 text-xs text-muted-foreground" onClick={() => setCell(null)}>Cerrar</button>
          </div>
          {cellBlocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada programado ese día.</p>
          ) : (
            <ul className="divide-y">
              {cellBlocks.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => setSelected(b)} className="flex min-h-[44px] w-full items-center gap-2 py-1.5 text-left text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs">{formatPlantTime(b.start)}–{formatPlantTime(b.end)}</span>
                    <span className={cn('min-w-0 flex-1 truncate', isLate(b.otId) && 'text-red-600')}>{otLabel(b.otId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5" /> El Gantt completo está en el computador; acá se ve y se ajusta lo mismo.
      </p>

      {selected && plan && (
        <StagePanel
          block={selected}
          schedule={schedule}
          plan={plan}
          planNow={planNow}
          otLabel={otLabel(selected.otId)}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

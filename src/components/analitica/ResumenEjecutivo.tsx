'use client';

/**
 * El Resumen de Analítica: el estado del taller en una pantalla.
 *
 * Reemplaza a ExecutiveOverview (2026-11-25), que tenía tres problemas además
 * de verse como un informe y no como un tablero:
 *
 *  - Contaba sobre `useOTs()`, que trae 200 OT. Con 250 en la base, lo vendido
 *    y la puntualidad eran una parte sin aviso. Ahora todo sale de
 *    `/api/analytics/resumen`, que pagina hasta agotar.
 *  - "Eficiencia del personal" y la "Matriz por área" promediaban
 *    quality_score / speed_score con 75 de relleno — columnas que nada
 *    escribe. Se fueron: una cifra de rellenos se lee como un hecho.
 *  - Lo más urgente no aparecía: cuántas OT en curso ya pasaron su plazo.
 *
 * Arriba, cinco cifras con su señal de color; debajo, lo que exige acción
 * (plata y plazos) lado a lado; al final, cómo fluye la producción y la flota.
 * Todo lo que es lista se lee en una línea y se abre al tocarlo.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, CircleDollarSign, Clock, Factory,
  ListChecks, TrendingDown, Truck, Wrench, AlertTriangle,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { OT_STATUS_LABELS, otStatusHex, otStatusLabel, machineStatusLabel } from '@/lib/status-labels';
import { useAnalyticsFiltersOptional } from '@/contexts/AnalyticsFiltersContext';
import { AlarmasDeCosto, useCostAlerts } from '@/components/analitica/AlarmasDeCosto';

interface DeadlineRow {
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  status: string;
  deadline: string;
  days_late: number;
}

interface ResumenPayload {
  truncated: boolean;
  total_ots: number;
  sold: { current: number; previous: number | null; count: number; by_month: { month: string; total: number }[] };
  on_time: {
    current: { pct: number | null; done: number };
    previous: { pct: number | null; done: number } | null;
  };
  active: { total: number; by_status: Record<string, number>; without_deadline: number };
  overdue: DeadlineRow[];
  due_soon: DeadlineRow[];
  fleet: { by_status: Record<string, number>; total: number; pending_maintenance: number };
}

const clp = (n: number) => `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

/** $1.304.702.638 → "$1.305 M": en un tile, los millones se leen; los pesos no. */
const clpShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: abs >= 100_000_000 ? 0 : 1 }).format(n / 1_000_000)} M`;
  return clp(n);
};

const toIso = (d: Date) => d.toISOString();

// Orden del flujo = orden de las etapas en el Tablero.
const PIPELINE = Object.keys(OT_STATUS_LABELS).filter((s) => s !== 'completed');

const MACHINE_TONE: Record<string, string> = {
  running: '#10b981',
  idle: '#94a3b8',
  maintenance: '#f59e0b',
  offline: '#ef4444',
};

// ── Piezas ──────────────────────────────────────────────────────────────────

function Delta({ value, suffix = '%', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-[11px] text-muted-foreground">sin base</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center text-[11px] font-semibold tabular-nums', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

type Tone = 'default' | 'critical' | 'warning' | 'success';
const TONE_TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
};
const TONE_RING: Record<Tone, string> = {
  default: '',
  critical: 'border-red-500/40 bg-red-500/[0.04]',
  warning: 'border-amber-500/40 bg-amber-500/[0.04]',
  success: '',
};
const TONE_ICON: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  critical: 'bg-red-500/15 text-red-600 dark:text-red-400',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

function Tile({
  icon: Icon, label, value, tone = 'default', foot, href, children,
}: {
  icon: typeof Clock; label: string; value: string; tone?: Tone;
  foot?: React.ReactNode; href?: string; children?: React.ReactNode;
}) {
  const body = (
    <Card className={cn('flex h-full flex-col gap-1.5 p-3 transition-shadow', href && 'hover:shadow-md', TONE_RING[tone])}>
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', TONE_ICON[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold leading-none tabular-nums', TONE_TEXT[tone])}>{value}</p>
      {foot && <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">{foot}</div>}
      {children && <div className="mt-auto pt-1">{children}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** Barra apilada por segmentos, con 1px entre ellos para que se lean. */
function StackBar({ parts, className }: { parts: { key: string; n: number; color: string; title: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (total === 0) return <div className={cn('h-2 rounded-full bg-muted', className)} />;
  return (
    <div className={cn('flex h-2 gap-px overflow-hidden rounded-full bg-muted', className)}>
      {parts.filter((p) => p.n > 0).map((p) => (
        <span key={p.key} title={`${p.title}: ${p.n}`} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

function SectionCard({ icon: Icon, title, right, children, className }: {
  icon: typeof Clock; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto">{right}</div>
      </div>
      <div className="flex flex-1 flex-col border-t px-2 pb-3 pt-1">{children}</div>
    </Card>
  );
}

// ── Plazos: atrasadas y por vencer ──────────────────────────────────────────

// `late` lo decide el servidor al armar las dos listas; no se recalcula con
// el reloj del navegador en cada render.
function PlazoLine({ r, late }: { r: DeadlineRow; late: boolean }) {
  const days = Math.abs(r.days_late);
  const tag = late
    ? (days === 0 ? 'vence hoy' : `${days} d tarde`)
    : (days === 0 ? 'hoy' : `en ${days} d`);
  return (
    <li>
      <Link
        href={`/operaciones/kanban?ot=${r.ot_id}`}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
        title={`Plazo ${format(new Date(r.deadline), "d 'de' MMMM", { locale: es })}`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: otStatusHex(r.status) }} aria-hidden />
        <span className="shrink-0 text-sm font-semibold tabular-nums">OT {r.ot_number ?? '—'}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.client_name ?? ''}</span>
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{otStatusLabel(r.status)}</span>
        <span className={cn(
          'w-[4.5rem] shrink-0 text-right font-mono text-xs font-semibold tabular-nums',
          late ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
        )}>
          {tag}
        </span>
      </Link>
    </li>
  );
}

function Plazos({ data, visibleCount = 5 }: { data: ResumenPayload; visibleCount?: number }) {
  const [tab, setTab] = useState<'overdue' | 'soon'>(data.overdue.length > 0 ? 'overdue' : 'soon');
  const [all, setAll] = useState(false);
  const rows = tab === 'overdue' ? data.overdue : data.due_soon;
  const shown = all ? rows : rows.slice(0, visibleCount);

  const tabBtn = (k: 'overdue' | 'soon', label: string, n: number, tone: string) => (
    <button
      type="button"
      onClick={() => { setTab(k); setAll(false); }}
      className={cn(
        'min-h-8 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-0 sm:px-2 sm:py-0.5 sm:text-[11px]',
        tab === k ? tone : 'border-transparent text-muted-foreground hover:bg-muted',
      )}
    >
      {n} {label}
    </button>
  );

  return (
    <SectionCard
      icon={CalendarClock}
      title="Plazos de lo que está en curso"
      right={
        <div className="flex gap-1">
          {tabBtn('overdue', 'atrasadas', data.overdue.length, 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300')}
          {tabBtn('soon', 'vencen en 7 días', data.due_soon.length, 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300')}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">
          {tab === 'overdue' ? 'Ninguna OT en curso pasó su plazo.' : 'Ninguna OT vence en los próximos 7 días.'}
        </p>
      ) : (
        <ul className="space-y-0.5">{shown.map((r) => <PlazoLine key={r.ot_id} r={r} late={tab === 'overdue'} />)}</ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 px-2 pt-2">
        {rows.length > visibleCount ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="tap text-xs font-medium text-primary underline-offset-4 hover:underline">
            {all ? `Mostrar sólo ${visibleCount}` : `Ver las ${rows.length}`}
          </button>
        ) : <span />}
        {data.active.without_deadline > 0 && (
          <span className="text-[11px] text-muted-foreground">{data.active.without_deadline} OT en curso sin plazo</span>
        )}
      </div>
    </SectionCard>
  );
}

// ── Flujo de producción ────────────────────────────────────────────────────

function Flujo({ data, className }: { data: ResumenPayload; className?: string }) {
  const parts = PIPELINE.map((s) => ({ key: s, n: data.active.by_status[s] ?? 0, color: otStatusHex(s), title: otStatusLabel(s) }));
  const max = Math.max(1, ...parts.map((p) => p.n));
  const lateBy: Record<string, number> = {};
  for (const r of data.overdue) lateBy[r.status] = (lateBy[r.status] ?? 0) + 1;

  return (
    <SectionCard
      className={className}
      icon={ListChecks}
      title="Dónde está el trabajo"
      right={<Link href="/operaciones/kanban" className="tap text-xs font-medium text-primary hover:underline">Abrir Tablero</Link>}
    >
      <div className="px-2 pb-2 pt-2">
        <StackBar parts={parts} className="h-3" />
      </div>
      {/* En columnas, no en grilla: se lee hacia abajo en el orden del flujo. */}
      <ul className="gap-x-6 sm:columns-2">
        {parts.map((p) => (
          <li key={p.key} className={cn('flex break-inside-avoid items-center gap-2 rounded-md px-2 py-1', p.n === 0 && 'opacity-40')}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs">{p.title}</span>
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${(p.n / max) * 100}%`, background: p.color }} />
            </span>
            <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums">{p.n}</span>
            <span className="w-10 shrink-0 text-right text-[10px] font-medium tabular-nums text-red-600 dark:text-red-400">
              {lateBy[p.key] ? `${lateBy[p.key]} tarde` : ''}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ── Flota ───────────────────────────────────────────────────────────────────

function Flota({ data }: { data: ResumenPayload }) {
  const entries = Object.entries(data.fleet.by_status).sort((a, b) => b[1] - a[1]);
  const parts = entries.map(([k, n]) => ({ key: k, n, color: MACHINE_TONE[k] ?? '#64748b', title: machineStatusLabel(k) }));
  const maint = data.fleet.pending_maintenance;
  return (
    <SectionCard
      icon={Factory}
      title="Flota"
      right={<span className="text-xs tabular-nums text-muted-foreground">{data.fleet.total} máquinas</span>}
    >
      <div className="space-y-3 px-2 pt-2">
        <StackBar parts={parts} className="h-3" />
        <ul className="space-y-1">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
              <span className="flex-1">{p.title}</span>
              <span className="font-semibold tabular-nums">{p.n}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/equipos/ordenes"
          className={cn(
            'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors hover:bg-muted/60',
            maint > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border',
          )}
        >
          <Wrench className={cn('h-3.5 w-3.5', maint > 0 ? 'text-amber-600' : 'text-muted-foreground')} />
          <span className="flex-1">Mantenciones pendientes</span>
          <span className={cn('font-semibold tabular-nums', maint > 0 && 'text-amber-600 dark:text-amber-400')}>{maint}</span>
        </Link>
        <p className="text-[10px] leading-snug text-muted-foreground">Estado según la ficha de cada máquina.</p>
      </div>
    </SectionCard>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function ResumenEjecutivo() {
  const { range, comparison } = useAnalyticsFiltersOptional();
  const qs = new URLSearchParams({
    from: toIso(range.from), to: toIso(range.to),
    cmp_from: toIso(comparison.from), cmp_to: toIso(comparison.to),
  });
  const { data, isLoading, error } = useQuery<ResumenPayload>({
    queryKey: ['analytics-resumen', qs.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/resumen?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Error ${res.status}`);
      return res.json();
    },
  });
  const { data: alarms } = useCostAlerts();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="flex items-center gap-2 border-destructive/40 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        No se pudo armar el resumen: {error instanceof Error ? error.message : 'sin respuesta'}
      </Card>
    );
  }

  const soldDelta = data.sold.previous ? ((data.sold.current - data.sold.previous) / data.sold.previous) * 100 : null;
  const ot = data.on_time;
  const otDelta = ot.current.pct != null && ot.previous?.pct != null ? ot.current.pct - ot.previous.pct : null;
  const overdueN = data.overdue.length;
  const activeN = data.active.total;
  const lost = alarms?.summary.dinero_perdido ?? 0;
  const lostN = alarms?.summary.perdida ?? 0;
  const flagged = alarms ? alarms.summary.perdida + alarms.summary.margen_critico + alarms.summary.sobrecosto : 0;

  const pipelineParts = PIPELINE.map((s) => ({ key: s, n: data.active.by_status[s] ?? 0, color: otStatusHex(s), title: otStatusLabel(s) }));
  const otTone: Tone = ot.current.pct == null ? 'default' : ot.current.pct >= 90 ? 'success' : ot.current.pct >= 75 ? 'warning' : 'critical';

  return (
    <div className="space-y-4">
      {data.truncated && (
        <Card className="flex items-center gap-2 border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Se leyeron {data.total_ots} OT y la consulta llegó a su tope: las cifras son una parte del total.
        </Card>
      )}

      {/* ── Cinco cifras ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          icon={CircleDollarSign}
          label="Vendido en el período"
          value={clpShort(data.sold.current)}
          foot={<><Delta value={soldDelta} /> <span>{data.sold.count} OT nuevas</span></>}
        >
          <div className="h-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sold.by_month} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="resumen-sold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={false}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, padding: '2px 8px' }}
                  labelFormatter={(_, p) => {
                    const m = p?.[0]?.payload?.month as string | undefined;
                    return m ? format(new Date(`${m}-01T12:00:00`), 'MMMM yyyy', { locale: es }) : '';
                  }}
                  formatter={(v: number) => [clpShort(v), 'Vendido']}
                />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#resumen-sold)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        <Tile
          icon={Clock}
          label="OT en curso"
          value={String(activeN)}
          href="/operaciones/kanban"
          foot={<span>en {Object.keys(data.active.by_status).length} etapas</span>}
        >
          <StackBar parts={pipelineParts} />
        </Tile>

        <Tile
          icon={CalendarClock}
          label="Atrasadas"
          value={activeN > 0 ? `${overdueN} de ${activeN}` : '0'}
          tone={overdueN === 0 ? 'success' : overdueN / Math.max(1, activeN) > 0.25 ? 'critical' : 'warning'}
          foot={<span>{data.due_soon.length} vencen en 7 días</span>}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-red-500" style={{ width: `${activeN ? (overdueN / activeN) * 100 : 0}%` }} />
          </div>
        </Tile>

        <Tile
          icon={Truck}
          label="Entregas a tiempo"
          value={ot.current.pct == null ? '—' : `${Math.round(ot.current.pct)}%`}
          tone={otTone}
          foot={
            ot.current.pct == null
              ? <span>ninguna OT terminada en el período</span>
              : <><Delta value={otDelta} suffix=" pts" /> <span>de {ot.current.done} terminadas</span></>
          }
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full rounded-full', otTone === 'success' ? 'bg-emerald-500' : otTone === 'warning' ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${ot.current.pct ?? 0}%` }}
            />
          </div>
        </Tile>

        <Tile
          icon={TrendingDown}
          label="Plata perdida"
          value={lost > 0 ? `−${clpShort(lost)}` : '$0'}
          tone={lostN > 0 ? 'critical' : flagged > 0 ? 'warning' : 'success'}
          href="/analitica/rentabilidad"
          foot={
            lostN > 0
              ? <span>en {lostN} OT · {flagged} con alarma</span>
              : <span>{flagged > 0 ? `${flagged} OT con alarma` : 'ninguna OT en pérdida'}</span>
          }
        />
      </div>

      {/* ── Lo que exige acción: plata y plazos ──────────────────────── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <AlarmasDeCosto />
        <Plazos data={data} />
      </div>

      {/* ── Cómo fluye ───────────────────────────────────────────────── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Flujo data={data} className="lg:col-span-2" />
        <Flota data={data} />
      </div>
    </div>
  );
}

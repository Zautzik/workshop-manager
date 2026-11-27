'use client';

/**
 * Los trabajos que perdieron plata, arriba de todo.
 *
 * Las alarmas existían sólo en `/api/cost-alerts`: había que saber que el
 * endpoint estaba ahí para enterarse de que una OT perdió $1.170.033. Una
 * alarma que hay que ir a buscar no es una alarma.
 *
 * Se muestra la pérdida primero y en plata, no en porcentaje: al dueño le
 * importa cuánto salió del bolsillo, no la proporción.
 *
 * Compacta y plegable (2026-11-25): la versión anterior ocupaba la pantalla
 * entera con ocho filas de dos líneas cada una, y el resto del Resumen quedaba
 * abajo del pliegue. Ahora cada OT es UNA línea —qué pasó, cuánto— y el
 * detalle se abre al tocarla; la tarjeta entera se pliega a su encabezado y
 * recuerda cómo la dejó quien la mira.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { TrendingDown, ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LEVEL_LABEL, type AlarmLevel } from '@/lib/cost-alarms';

interface AlarmRow {
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  level: AlarmLevel;
  reasons: string[];
  revenue: number;
  actual_cost: number;
  margin_amount: number;
  margin_pct: number | null;
  overrun_pct: number | null;
}

export interface CostAlertsPayload {
  thresholds: { overrunPct: number; minMarginPct: number };
  alerts: AlarmRow[];
  summary: {
    total: number; perdida: number; margen_critico: number;
    sobrecosto: number; sin_datos: number; dinero_perdido: number; headline: string;
  };
}

/** Un color por nivel: el punto de la fila, el chip del encabezado y el monto. */
const TONE: Record<AlarmLevel, { dot: string; text: string; chip: string }> = {
  perdida:        { dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',         chip: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' },
  margen_critico: { dot: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-400',   chip: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  sobrecosto:     { dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400',     chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  sin_datos:      { dot: 'bg-slate-400',   text: 'text-muted-foreground',                  chip: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  ok:             { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
};

const ORDER: AlarmLevel[] = ['perdida', 'margen_critico', 'sobrecosto', 'sin_datos', 'ok'];

const clp = (n: number) => `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

const STORAGE_KEY = 'resumen:alarmas-abiertas';

export function useCostAlerts() {
  return useQuery<CostAlertsPayload>({
    queryKey: ['cost-alerts'],
    queryFn: async () => {
      const res = await fetch('/api/cost-alerts', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las alarmas de costo');
      return res.json();
    },
  });
}

/** Lo que dice la fila sin abrirla: la plata cuando hay pérdida, el % si no. */
function rowFigure(a: AlarmRow): string {
  if (a.level === 'perdida') return clp(a.margin_amount);
  if (a.level === 'margen_critico' && a.margin_pct != null) return `${a.margin_pct.toFixed(1)}% margen`;
  if (a.overrun_pct != null) return `+${a.overrun_pct.toFixed(0)}% costo`;
  return LEVEL_LABEL[a.level];
}

function AlarmLine({ a }: { a: AlarmRow }) {
  const [open, setOpen] = useState(false);
  const t = TONE[a.level];
  return (
    <li className="rounded-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', t.dot)} aria-hidden />
        <span className="shrink-0 text-sm font-semibold tabular-nums">OT {a.ot_number ?? '—'}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{a.client_name ?? ''}</span>
        <span className={cn('shrink-0 font-mono text-xs font-semibold tabular-nums', t.text)}>{rowFigure(a)}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mb-1 ml-6 space-y-0.5 border-l-2 border-border pl-3 pr-2 pb-1">
          <p className={cn('text-[11px] font-semibold uppercase tracking-wide', t.text)}>{LEVEL_LABEL[a.level]}</p>
          {a.reasons.map((r) => (
            <p key={r} className="text-xs text-muted-foreground">{r}</p>
          ))}
          <Link
            href={`/operaciones/kanban?ot=${a.ot_id}`}
            className="inline-flex items-center gap-0.5 pt-0.5 text-xs font-medium text-primary hover:underline"
          >
            Abrir la OT <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </li>
  );
}

export function AlarmasDeCosto({ visibleCount = 5, className }: { visibleCount?: number; className?: string }) {
  const { data, isLoading } = useCostAlerts();
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);

  // Cómo dejó la tarjeta quien la mira. Si el navegador no deja guardar, se
  // abre: perder la preferencia es mejor que esconder una pérdida.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '0') setOpen(false);
    } catch { /* sin almacenamiento: queda abierta */ }
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(STORAGE_KEY, v ? '0' : '1'); } catch { /* idem */ }
      return !v;
    });
  };

  if (isLoading) return <Skeleton className={cn('h-48 w-full', className)} />;
  if (!data) return null;

  const { alerts, summary, thresholds } = data;
  const sorted = [...alerts].sort((x, y) => ORDER.indexOf(x.level) - ORDER.indexOf(y.level));
  const shown = all ? sorted : sorted.slice(0, visibleCount);

  const chips: { level: AlarmLevel; n: number; label: string }[] = [
    { level: 'perdida', n: summary.perdida, label: 'en pérdida' },
    { level: 'margen_critico', n: summary.margen_critico, label: 'margen bajo' },
    { level: 'sobrecosto', n: summary.sobrecosto, label: 'sobre lo estimado' },
  ];

  return (
    <Card className={cn('flex flex-col', summary.perdida > 0 && 'border-red-500/40', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          <TrendingDown className="h-4 w-4 text-red-500" />
          Trabajos que exigen una mirada
        </span>
        {summary.perdida > 0 && (
          <span className="font-mono text-base font-bold tabular-nums text-red-600 dark:text-red-400">
            −{clp(summary.dinero_perdido)}
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {chips.filter((c) => c.n > 0).map((c) => (
            <span key={c.level} className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE[c.level].chip)}>
              {c.n} {c.label}
            </span>
          ))}
        </span>
      </button>

      {open && (
        <div className="flex flex-1 flex-col border-t px-2 pb-3 pt-1">
          {alerts.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Ningún trabajo con costo real cargado está en pérdida ni sobre lo estimado.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {shown.map((a) => <AlarmLine key={a.ot_id} a={a} />)}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
            {sorted.length > visibleCount ? (
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                className="tap text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {all ? `Mostrar sólo ${visibleCount}` : `Ver las ${sorted.length}`}
              </button>
            ) : <span />}
            <span
              className="text-[11px] text-muted-foreground"
              title="Un margen calculado sin costo real sería el 100% del ingreso: por eso esas OT no se evalúan."
            >
              Alarma sobre {thresholds.overrunPct}% de sobrecosto o bajo {thresholds.minMarginPct}% de margen
              {summary.sin_datos > 0 && ` · ${summary.sin_datos} OT sin costo real`}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

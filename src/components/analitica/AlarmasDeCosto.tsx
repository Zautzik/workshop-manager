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
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { TrendingDown, AlertTriangle, ArrowUpRight, CheckCircle2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

interface Payload {
  thresholds: { overrunPct: number; minMarginPct: number };
  alerts: AlarmRow[];
  summary: {
    total: number; perdida: number; margen_critico: number;
    sobrecosto: number; sin_datos: number; dinero_perdido: number; headline: string;
  };
}

const STYLE: Record<AlarmLevel, { badge: string; icon: typeof TrendingDown }> = {
  perdida:        { badge: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300', icon: TrendingDown },
  margen_critico: { badge: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300', icon: AlertTriangle },
  sobrecosto:     { badge: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: ArrowUpRight },
  sin_datos:      { badge: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-300', icon: HelpCircle },
  ok:             { badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
};

const clp = (n: number) => `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

export function AlarmasDeCosto() {
  const { data, isLoading } = useQuery<Payload>({
    queryKey: ['cost-alerts'],
    queryFn: async () => {
      const res = await fetch('/api/cost-alerts', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las alarmas de costo');
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!data) return null;

  const { alerts, summary, thresholds } = data;
  const perdidas = alerts.filter((a) => a.level === 'perdida');
  const resto = alerts.filter((a) => a.level !== 'perdida');

  return (
    <Card className={perdidas.length > 0 ? 'border-red-500/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4" />
              Trabajos que exigen una mirada
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{summary.headline}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.perdida > 0 && (
              <Badge variant="outline" className={STYLE.perdida.badge}>
                {summary.perdida} en pérdida
              </Badge>
            )}
            {summary.sobrecosto > 0 && (
              <Badge variant="outline" className={STYLE.sobrecosto.badge}>
                {summary.sobrecosto} sobre lo estimado
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {summary.perdida > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="font-mono text-3xl font-bold tabular-nums text-red-600 dark:text-red-400">
              −{clp(summary.dinero_perdido)}
            </p>
            <p className="mt-1 text-sm text-red-800 dark:text-red-200">
              Plata perdida en {summary.perdida} trabajo{summary.perdida === 1 ? '' : 's'}.
            </p>
          </div>
        )}

        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ningún trabajo con costo real cargado está en pérdida ni sobre lo estimado.
          </p>
        ) : (
          <ul className="divide-y">
            {[...perdidas, ...resto].slice(0, 8).map((a) => {
              const st = STYLE[a.level];
              const Icon = st.icon;
              return (
                <li key={a.ot_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/operaciones/kanban?ot=${a.ot_id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        OT {a.ot_number ?? '—'}
                      </Link>
                      {a.client_name && (
                        <span className="text-sm text-muted-foreground">{a.client_name}</span>
                      )}
                    </div>
                    {a.reasons.map((r) => (
                      <p key={r} className="mt-0.5 text-xs text-muted-foreground">{r}</p>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.level === 'perdida' && (
                      <span className="font-mono text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {clp(a.margin_amount)}
                      </span>
                    )}
                    <Badge variant="outline" className={`gap-1 ${st.badge}`}>
                      <Icon className="h-3 w-3" />
                      {LEVEL_LABEL[a.level]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Umbrales: alarma sobre {thresholds.overrunPct}% de sobrecosto y bajo{' '}
          {thresholds.minMarginPct}% de margen. {summary.sin_datos} OT no tienen costo real
          cargado y por eso no se evalúan — un margen calculado sin costo sería el 100% del
          ingreso, que es la cifra más engañosa que puede mostrar esta pantalla.
        </p>
      </CardContent>
    </Card>
  );
}

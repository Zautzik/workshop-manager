'use client';

/**
 * Las pautas de mantenimiento, y cuál vence primero.
 *
 * `maintenance_schedules` tenía 12 pautas cargadas y ninguna pantalla las
 * mostraba: la tabla no se leía en ninguna parte del código. Lo que se veía en
 * "Programa" son documentos de manual (`maintenance_programs`), que no tienen
 * frecuencia y por lo tanto nunca vencen.
 */

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Gauge, TriangleAlert, CheckCircle2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DUE_STATUS_LABEL, type DueStatus, type DueResult } from '@/lib/maintenance-due';
import { usageUnitShort } from '@/types/machine-usage-unit';

interface ScheduleRow {
  id: string;
  machine_name: string | null;
  maintenance_type: string;
  description: string | null;
  frequency_days: number | null;
  frequency_usage: number | null;
  usage_unit: string;
  machine_systems: { name: string } | null;
  due: DueResult;
}

const STYLE: Record<DueStatus, { badge: string; icon: typeof TriangleAlert }> = {
  vencida:   { badge: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300', icon: TriangleAlert },
  proxima:   { badge: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: CalendarClock },
  al_dia:    { badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  sin_datos: { badge: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-300', icon: HelpCircle },
};

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function PautasVencidas() {
  const { data, isLoading } = useQuery<{
    schedules: ScheduleRow[];
    summary: Record<string, number>;
  }>({
    queryKey: ['maintenance-schedules'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance/schedules');
      if (!res.ok) throw new Error('No se pudieron cargar las pautas');
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const schedules = data?.schedules ?? [];
  const s = data?.summary ?? {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            Pautas de mantenimiento
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {Number(s.vencidas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.vencida.badge}>{s.vencidas} vencidas</Badge>
            )}
            {Number(s.proximas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.proxima.badge}>{s.proximas} próximas</Badge>
            )}
            <Badge variant="secondary">{s.total ?? 0} en total</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {Number(s.por_uso ?? 0) === 0 && schedules.length > 0 && (
          <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-800 dark:text-sky-200">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Todas las pautas vencen sólo por calendario. Si le pones frecuencia por uso a las
            que corresponde —lubricar cada tantas impresiones, filtro cada tantas horas— el
            contador empieza a mandar sobre el mantenimiento, no el almanaque.
          </p>
        )}

        {schedules.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay pautas cargadas.
          </p>
        ) : (
          <ul className="divide-y">
            {schedules.map((row) => {
              const st = STYLE[row.due.status];
              const Icon = st.icon;
              const unidad = usageUnitShort(row.usage_unit);
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.machine_name ?? 'Sin máquina'}</span>
                      <Badge variant="secondary" className="text-xs">{row.maintenance_type}</Badge>
                      {row.machine_systems?.name && (
                        <span className="text-xs text-muted-foreground">{row.machine_systems.name}</span>
                      )}
                    </div>
                    {row.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{row.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{row.due.reason}</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {row.frequency_days ? <span>cada {row.frequency_days} días</span> : null}
                      {row.frequency_usage ? (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          cada {nf.format(row.frequency_usage)} {unidad}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Qué camino la hace vencer: es la diferencia entre
                        "hay que hacerlo porque pasó el tiempo" y "porque la
                        máquina trabajó". */}
                    {row.due.driver && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        {row.due.driver === 'uso' ? <Gauge className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                        por {row.due.driver}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`gap-1 ${st.badge}`}>
                      <Icon className="h-3 w-3" />
                      {DUE_STATUS_LABEL[row.due.status]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

/**
 * Historial & KPIs — de vuelta a lo que su propio nombre en el menú prometía
 * ("MTBF, MTTR y métricas de flota") sin que nada del código lo calculara.
 *
 * La disponibilidad y el downtime por máquina ya existían en
 * /api/maintenance/downtime (antes sólo montados en /equipos/stats, una
 * página huérfana sin ningún link real hacia ella). MTBF/MTTR son nuevos:
 * requieren distinguir una parada CORRECTIVA (una falla real) de una
 * PREVENTIVA (planificada, no es una falla) — algo que `machine_downtime_logs`
 * no podía hacer hasta la migración que le agregó `work_order_id`. Las filas
 * de antes de ese cambio quedan sin atribuir a propósito: no hay forma
 * honesta de reclasificarlas retroactivamente.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Calendar, Cpu, Clock, Wrench, Gauge, Activity, Timer } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';

interface DowntimeMachineRow {
  machine_id: string;
  name: string;
  type: string;
  status: string;
  downtime_hours: number;
  downtime_events: number;
  currently_down: boolean;
  availability_pct: number;
  corrective_events: number;
  corrective_downtime_hours: number;
}

interface DowntimeLog {
  id: string;
  machine_id: string;
  reason: string | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
}

interface DowntimeResponse {
  window_days: number;
  machines: DowntimeMachineRow[];
  totals: {
    downtime_hours: number;
    machines_down_now: number;
    fleet_availability_pct: number;
    corrective_events: number;
    mtbf_hours: number | null;
    mttr_hours: number | null;
  };
  recent: DowntimeLog[];
}

function useFleetDowntime(days: number) {
  return useQuery<DowntimeResponse>({
    queryKey: ['maintenance', 'downtime', days],
    queryFn: async () => {
      const res = await fetch(`/api/maintenance/downtime?days=${days}`, { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo calcular la disponibilidad de la flota');
      return res.json();
    },
    staleTime: 60_000,
  });
}

/** Horas cortas como horas, horas largas como días — MTBF fácilmente pasa la ventana completa. */
function formatHours(hours: number): string {
  if (hours >= 48) return `${Math.round((hours / 24) * 10) / 10} d`;
  return `${Math.round(hours * 10) / 10} h`;
}

function availabilityTone(pct: number): 'success' | 'warning' | 'critical' {
  if (pct >= 95) return 'success';
  if (pct >= 85) return 'warning';
  return 'critical';
}

// ── KPIs + ranking de downtime ──────────────────────────────────────────────

function DisponibilidadYFallas({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  const { data, isLoading, isError } = useFleetDowntime(days);

  const rankedDowntime: RankedListItem[] = useMemo(() => {
    const withDowntime = (data?.machines ?? []).filter((m) => m.downtime_hours > 0);
    const max = Math.max(1, ...withDowntime.map((m) => m.downtime_hours));
    return withDowntime.map((m) => ({
      id: m.machine_id,
      label: m.name,
      sublabel: m.currently_down ? 'caída ahora' : `${m.downtime_events} evento${m.downtime_events !== 1 ? 's' : ''}`,
      barPct: (m.downtime_hours / max) * 100,
      barColor: m.currently_down ? '#d03b3b' : undefined,
      value: `${m.downtime_hours} h`,
      title: `${m.downtime_hours}h de downtime en ${m.downtime_events} evento(s), ${m.availability_pct}% disponible`,
    }));
  }, [data?.machines]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Disponibilidad y fallas</h2>
          <p className="text-xs text-muted-foreground">
            Toda parada cuenta para la disponibilidad; sólo las correctivas —fallas reales, no
            mantención planificada— cuentan para MTBF y MTTR.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="downtime-days" className="text-xs text-muted-foreground whitespace-nowrap">
            Ventana (días)
          </Label>
          <Input
            id="downtime-days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 30)))}
            className="h-8 w-16 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : isError || !data ? (
        <Card><CardContent className="py-8 text-center text-sm text-destructive">No se pudo calcular la disponibilidad de la flota.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Gauge}
              label="Disponibilidad de flota"
              value={`${data.totals.fleet_availability_pct}%`}
              tone={availabilityTone(data.totals.fleet_availability_pct)}
              hint={`Últimos ${data.window_days} días · ${data.totals.downtime_hours}h de downtime`}
            />
            <KpiCard
              icon={Activity}
              label="MTBF"
              value={data.totals.mtbf_hours !== null ? formatHours(data.totals.mtbf_hours) : '—'}
              hint={
                data.totals.mtbf_hours !== null
                  ? 'Tiempo medio entre fallas correctivas'
                  : 'Aún no hay fallas correctivas registradas desde que se distingue el tipo de orden'
              }
            />
            <KpiCard
              icon={Timer}
              label="MTTR"
              value={data.totals.mttr_hours !== null ? formatHours(data.totals.mttr_hours) : '—'}
              hint={
                data.totals.mttr_hours !== null
                  ? `Tiempo medio de reparación · ${data.totals.corrective_events} falla(s)`
                  : 'Aún no hay fallas correctivas registradas'
              }
            />
            {data.totals.machines_down_now > 0 ? (
              <KpiCard
                icon={Wrench}
                label="Caídas ahora"
                value={String(data.totals.machines_down_now)}
                tone="critical"
                hint="Máquina(s) con una orden de mantención abierta"
              />
            ) : (
              <KpiCard icon={Wrench} label="Caídas ahora" value="0" tone="success" hint="Ninguna máquina fuera de servicio" />
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Máquinas con más tiempo de inactividad</CardTitle>
              <p className="text-xs text-muted-foreground">Últimos {data.window_days} días, toda causa.</p>
            </CardHeader>
            <CardContent>
              {rankedDowntime.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Ninguna máquina registró downtime en los últimos {data.window_days} días.
                </p>
              ) : (
                <RankedList items={rankedDowntime} visibleCount={5} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Historial completo, cronológico ─────────────────────────────────────────

function HistorialCompleto() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['completed']);

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
    </div>
  );
  if (!orders.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No hay intervenciones completadas aún.</p>
    </div>
  );

  const byMonth: Record<string, any[]> = {};
  for (const o of orders) {
    const key = o.scheduled_date
      ? format(parseISO(o.scheduled_date), 'MMMM yyyy', { locale: es })
      : 'Sin fecha';
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(o);
  }

  const totalMinutes = orders.reduce((s: number, o: any) => s + (o.total_time_minutes ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/25">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold text-green-400">{orders.length} completadas en total</span>
        </div>
        {totalMinutes > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/25">
            <Clock className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-400">{Math.round(totalMinutes / 60)} h {totalMinutes % 60} min acumuladas</span>
          </div>
        )}
      </div>

      <div className="space-y-6 max-w-2xl">
        {Object.entries(byMonth).map(([month, items]) => (
          <div key={month} className="space-y-2">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground/70 pl-1 capitalize">
              {month}
            </h3>
            <div className="space-y-2">
              {items.map((o: any) => (
                <div
                  key={o.id}
                  className="relative flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500/70 rounded-l-xl" />
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 ml-1" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {o.maintenance_checklists?.name ?? 'Orden de mantenimiento'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      {o.machines?.name && (
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-orange-400/80" />
                          <span className="text-foreground/70 font-medium">{o.machines.name}</span>
                        </span>
                      )}
                      {o.scheduled_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(o.scheduled_date), "d 'de' MMM", { locale: es })}
                        </span>
                      )}
                      {o.total_time_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {o.total_time_minutes} min
                        </span>
                      )}
                      {o.maintenance_checklists?.frequency && (
                        <span className="flex items-center gap-1 capitalize">
                          <Wrench className="h-3 w-3" />
                          {o.maintenance_checklists.frequency}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px] font-bold shrink-0">
                    Completada
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistorialPanel() {
  const [days, setDays] = useState(30);

  return (
    <div className="space-y-8">
      <DisponibilidadYFallas days={days} setDays={setDays} />
      <div className="space-y-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground">Historial completo de intervenciones</h2>
        <HistorialCompleto />
      </div>
    </div>
  );
}

export default HistorialPanel;

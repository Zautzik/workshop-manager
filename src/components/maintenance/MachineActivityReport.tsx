'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Cpu, Activity, Gauge } from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';
import { useMachineActivity } from '@/hooks/use-machine-activity';
import { machineStatusLabel } from '@/lib/status-labels';

export default function MachineActivityReport() {
  const { data, isLoading } = useMachineActivity();

  const ranked: RankedListItem[] = useMemo(() => {
    const rows = data?.machines ?? [];
    const max = Math.max(1, ...rows.map((r) => r.production_hours));
    // Ordenadas por carga real: la lista debe reforzar visualmente al "equipo
    // más activo" de arriba, no dejarlo como un dato suelto que no calza con
    // el orden de abajo.
    return [...rows]
      .sort((a, b) => b.production_hours - a.production_hours)
      .map((m) => ({
        id: m.machine_id,
        label: m.name ?? '—',
        sublabel: `${machineStatusLabel(m.status)} · ${m.ots_processed} OT${m.ots_processed !== 1 ? 's' : ''}${
          m.current_active > 0 ? ` · ${m.current_active} activa${m.current_active > 1 ? 's' : ''}` : ''
        }`,
        barPct: (m.production_hours / max) * 100,
        barColor: '#6366f1',
        value: `${m.production_hours} h`,
      }));
  }, [data?.machines]);

  if (isLoading || !data) {
    return <div className="space-y-3"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div><Skeleton className="h-72 w-full" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Clock} label={`Horas producción (${data.window_days}d)`} value={`${data.summary.total_production_hours} h`} tone="primary" />
        <KpiCard icon={Gauge} label="Produciendo ahora" value={`${data.summary.producing_now}/${data.summary.machine_count}`} tone="success" />
        <KpiCard icon={Activity} label="OTs activas" value={String(data.summary.active_ots)} tone="info" />
        <KpiCard icon={Cpu} label="Equipo más activo" value={data.summary.busiest?.name ?? '—'} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" />Carga por máquina · últimos {data.window_days} días</CardTitle>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin máquinas registradas.</p>
          ) : (
            <RankedList items={ranked} visibleCount={8} />
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Horas de producción derivadas del tiempo que las OTs asignadas pasaron en etapas de impresión, troquelado y acabado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

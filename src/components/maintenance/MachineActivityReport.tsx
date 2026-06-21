'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Cpu, Activity, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMachineActivity } from '@/hooks/use-machine-activity';
import { machineStatusLabel } from '@/lib/status-labels';

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-500', idle: 'bg-slate-400', maintenance: 'bg-amber-500', offline: 'bg-rose-500',
};

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className={cn('h-4 w-4', tone)} />{label}
        </div>
        <div className={cn('mt-1 text-2xl font-bold', tone ?? 'text-foreground')}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function MachineActivityReport() {
  const { data, isLoading } = useMachineActivity();

  if (isLoading || !data) {
    return <div className="space-y-3"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div><Skeleton className="h-72 w-full" /></div>;
  }

  const maxHours = data.machines.reduce((m, r) => Math.max(m, r.production_hours), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Clock} label={`Horas producción (${data.window_days}d)`} value={`${data.summary.total_production_hours} h`} tone="text-indigo-500" />
        <Stat icon={Gauge} label="Produciendo ahora" value={`${data.summary.producing_now}/${data.summary.machine_count}`} tone="text-emerald-500" />
        <Stat icon={Activity} label="OTs activas" value={String(data.summary.active_ots)} tone="text-blue-500" />
        <Stat icon={Cpu} label="Equipo más activo" value={data.summary.busiest?.name ?? '—'} tone="text-amber-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" />Carga por máquina · últimos {data.window_days} días</CardTitle>
        </CardHeader>
        <CardContent>
          {data.machines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin máquinas registradas.</p>
          ) : (
            <div className="space-y-3">
              {data.machines.map((m) => (
                <div key={m.machine_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[m.status ?? ''] ?? 'bg-slate-400')} />
                      {m.name}
                      {m.current_active > 0 && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">{m.current_active} activa{m.current_active > 1 ? 's' : ''}</Badge>}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {m.production_hours} h · {m.ots_processed} OTs · {machineStatusLabel(m.status)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500/70" style={{ width: `${maxHours > 0 ? (m.production_hours / maxHours) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Horas de producción derivadas del tiempo que las OTs asignadas pasaron en etapas de impresión, troquelado y acabado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

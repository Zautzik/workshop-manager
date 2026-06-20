'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Calendar, Cpu, Clock, Wrench } from 'lucide-react';

function HistorialList() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['completed']);

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
    </div>
  );
  if (!orders.length) return (
    <div className="text-center py-20 text-muted-foreground">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No hay intervenciones completadas aún.</p>
    </div>
  );

  // Group by month
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
    <div className="space-y-8">
      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/25">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold text-green-400">{orders.length} completadas</span>
        </div>
        {totalMinutes > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/25">
            <Clock className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-400">{Math.round(totalMinutes / 60)} h {totalMinutes % 60} min total</span>
          </div>
        )}
      </div>

      {/* Month groups */}
      {Object.entries(byMonth).map(([month, items]) => (
        <div key={month} className="space-y-2">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground/70 pl-1 capitalize">
            {month}
          </h2>
          <div className="space-y-2">
            {items.map((o: any) => (
              <div
                key={o.id}
                className="relative flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm overflow-hidden"
              >
                {/* Left accent bar */}
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
  );
}

export default function MaintenanceHistorialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Historial de Intervenciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro de mantenimientos completados</p>
        </div>
        <HistorialList />
      </div>
    </ProtectedRoute>
  );
}

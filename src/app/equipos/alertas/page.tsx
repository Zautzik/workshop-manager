'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Cpu, Calendar, Clock, CheckCircle2 } from 'lucide-react';

function AlertsList() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['pending']);

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
    </div>
  );

  const overdue  = orders.filter((o: any) => o.scheduled_date && isPast(parseISO(o.scheduled_date)));
  const upcoming = orders.filter((o: any) => !o.scheduled_date || !isPast(parseISO(o.scheduled_date)));

  if (!orders.length) return (
    <div className="text-center py-20 text-muted-foreground">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500/40" />
      <p className="font-medium">Sin alertas pendientes — todo al día.</p>
    </div>
  );

  const OverdueCard = ({ o }: { o: any }) => {
    const daysOverdue = o.scheduled_date
      ? differenceInDays(new Date(), parseISO(o.scheduled_date))
      : null;
    return (
      <div className="relative flex items-center gap-4 px-4 py-3.5 rounded-xl border border-destructive/40 bg-destructive/6 overflow-hidden">
        {/* Left bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive rounded-l-xl" />
        {/* Pulse dot */}
        <div className="relative ml-1 shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">
            {o.maintenance_checklists?.name ?? 'Orden pendiente'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
            {o.machines?.name && (
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-orange-400/80" />
                <span className="text-foreground/70 font-medium">{o.machines.name}</span>
              </span>
            )}
            {o.scheduled_date && (
              <span className="flex items-center gap-1 text-destructive/80">
                <Calendar className="h-3 w-3" />
                {format(parseISO(o.scheduled_date), 'PP', { locale: es })}
              </span>
            )}
            {o.maintenance_checklists?.frequency && (
              <span className="capitalize">{o.maintenance_checklists.frequency}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className="bg-destructive/90 text-white border-0 text-[10px] font-bold">Vencida</Badge>
          {daysOverdue !== null && daysOverdue > 0 && (
            <span className="text-[10px] text-destructive/80 font-semibold">{daysOverdue}d atraso</span>
          )}
        </div>
      </div>
    );
  };

  const UpcomingCard = ({ o }: { o: any }) => (
    <div className="relative flex items-center gap-4 px-4 py-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/60 rounded-l-xl" />
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 ml-1" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">
          {o.maintenance_checklists?.name ?? 'Orden pendiente'}
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
              {format(parseISO(o.scheduled_date), 'PP', { locale: es })}
            </span>
          )}
          {o.maintenance_checklists?.frequency && (
            <span className="capitalize">{o.maintenance_checklists.frequency}</span>
          )}
        </div>
      </div>
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-bold shrink-0">
        Próxima
      </Badge>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {overdue.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">{overdue.length} vencidas</span>
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/25">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">{upcoming.length} próximas</span>
          </div>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-destructive/80 pl-1">
            Vencidas ({overdue.length})
          </h2>
          <div className="space-y-2">
            {overdue.map((o: any) => <OverdueCard key={o.id} o={o} />)}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-amber-500/70 pl-1">
            Próximas ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.map((o: any) => <UpcomingCard key={o.id} o={o} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MaintenanceAlertasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Alertas de Mantenimiento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Órdenes vencidas y próximas intervenciones</p>
        </div>
        <AlertsList />
      </div>
    </ProtectedRoute>
  );
}

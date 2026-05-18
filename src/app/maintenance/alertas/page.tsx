'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Cpu, Calendar } from 'lucide-react';

function AlertsList() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['pending']);

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  const overdue   = orders.filter((o: any) => o.scheduled_date && isPast(parseISO(o.scheduled_date)));
  const upcoming  = orders.filter((o: any) => !o.scheduled_date || !isPast(parseISO(o.scheduled_date)));

  if (!orders.length) return (
    <div className="text-center py-20 text-muted-foreground">
      <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No hay alertas de mantenimiento pendientes.</p>
    </div>
  );

  const Section = ({ title, items, urgent }: { title: string; items: any[]; urgent?: boolean }) => items.length === 0 ? null : (
    <div className="space-y-2">
      <h2 className={`text-sm font-semibold ${urgent ? 'text-destructive' : 'text-muted-foreground'}`}>{title} ({items.length})</h2>
      {items.map((o: any) => (
        <Card key={o.id} className={urgent ? 'border-destructive/40 bg-destructive/5' : ''}>
          <CardContent className="flex items-center gap-4 p-4">
            <AlertTriangle className={`h-5 w-5 shrink-0 ${urgent ? 'text-destructive' : 'text-amber-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{o.maintenance_checklists?.name ?? 'Orden pendiente'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {o.machines?.name && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{o.machines.name}</span>}
                {o.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(o.scheduled_date), 'PP', { locale: es })}</span>}
                {o.maintenance_checklists?.frequency && <span className="capitalize">{o.maintenance_checklists.frequency}</span>}
              </div>
            </div>
            {urgent && <Badge className="bg-destructive text-white text-xs shrink-0">Vencida</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title="Vencidas" items={overdue} urgent />
      <Section title="Próximas" items={upcoming} />
    </div>
  );
}

export default function MaintenanceAlertasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas de Mantenimiento</h1>
          <p className="text-sm text-muted-foreground mt-1">Órdenes vencidas y próximas intervenciones</p>
        </div>
        <AlertsList />
      </div>
    </ProtectedRoute>
  );
}

'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Calendar, Cpu, Clock } from 'lucide-react';

function HistorialList() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['completed']);

  if (isLoading) return <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!orders.length) return (
    <div className="text-center py-20 text-muted-foreground">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No hay intervenciones completadas aún.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map((o: any) => (
        <Card key={o.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{o.maintenance_checklists?.name ?? 'Orden de mantenimiento'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {o.machines?.name && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{o.machines.name}</span>}
                {o.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(o.scheduled_date), 'PP', { locale: es })}</span>}
                {o.total_time_minutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{o.total_time_minutes} min</span>}
              </div>
            </div>
            <Badge className="bg-green-500 text-white text-xs shrink-0">Completada</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MaintenanceHistorialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Historial de Intervenciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Registro de mantenimientos completados</p>
        </div>
        <HistorialList />
      </div>
    </ProtectedRoute>
  );
}

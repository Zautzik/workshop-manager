'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrders } from '@/hooks/use-maintenance-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Calendar, Cpu, AlertCircle } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-amber-500',
  in_progress: 'bg-blue-500',
  completed:   'bg-green-500',
  cancelled:   'bg-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  pending:     'Pendiente',
  in_progress: 'En curso',
  completed:   'Completada',
  cancelled:   'Cancelada',
};

function OrdersList() {
  const { data: orders = [], isLoading, isError, error } = useMaintenanceWorkOrders();

  if (isLoading) return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (isError) return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-6 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Error cargando órdenes.'}</p>
      </CardContent>
    </Card>
  );
  if (!orders.length) return (
    <div className="text-center py-20 text-muted-foreground">
      <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No hay órdenes de trabajo registradas.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map((o: any) => (
        <Card key={o.id} className="overflow-hidden">
          <div className={`h-1 w-full ${STATUS_COLOR[o.status] ?? 'bg-gray-300'}`} />
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{o.maintenance_checklists?.name ?? 'Sin checklist'}</span>
                <Badge variant="outline" className="text-xs">{STATUS_LABEL[o.status] ?? o.status}</Badge>
                {o.priority && <Badge className="text-xs bg-orange-500 text-white">Prioridad {o.priority}</Badge>}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                {o.machines?.name && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{o.machines.name}</span>}
                {o.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(o.scheduled_date), 'PPP', { locale: es })}</span>}
                {o.maintenance_checklists?.frequency && <span className="capitalize">{o.maintenance_checklists.frequency}</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MaintenanceOrdenesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plan & Órdenes</h1>
          <p className="text-sm text-muted-foreground mt-1">Listado completo de órdenes de mantenimiento</p>
        </div>
        <Suspense fallback={<div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}>
          <OrdersList />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

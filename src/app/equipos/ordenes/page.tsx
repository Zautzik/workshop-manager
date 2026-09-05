'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceWorkOrders } from '@/hooks/use-maintenance-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Calendar, Cpu, AlertCircle, TriangleAlert, ListChecks, CalendarClock } from 'lucide-react';
import { VencimientosPanel } from '@/components/maintenance/VencimientosPanel';
import { PautasPanel } from '@/components/maintenance/PautasPanel';
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';

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

// TODO(fase 5): esta lista pasa a ser interactiva -- abrir una orden, tildar
// su checklist (persistido vía completed_items), iniciar/completar. Hoy sigue
// siendo de sólo lectura; lo nuevo de esta fase es que ahora vive junto a
// Vencimientos en vez de ser la única pestaña de la página.
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
                <span className="font-semibold text-sm">{o.maintenance_checklists?.name ?? o.title ?? 'Sin checklist'}</span>
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

const VALID_TABS = ['vencimientos', 'ordenes', 'pautas', 'checklists'] as const;
type TabKey = (typeof VALID_TABS)[number];

function MantencionTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'vencimientos';

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/equipos/ordenes?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-xl grid-cols-4">
        <TabsTrigger value="vencimientos" className="gap-2">
          <TriangleAlert className="h-4 w-4" /> Vencimientos
        </TabsTrigger>
        <TabsTrigger value="ordenes" className="gap-2">
          <ListChecks className="h-4 w-4" /> Órdenes
        </TabsTrigger>
        <TabsTrigger value="pautas" className="gap-2">
          <CalendarClock className="h-4 w-4" /> Pautas
        </TabsTrigger>
        <TabsTrigger value="checklists" className="gap-2">
          <ClipboardList className="h-4 w-4" /> Checklists
        </TabsTrigger>
      </TabsList>

      <TabsContent value="vencimientos" className="mt-6">
        <VencimientosPanel />
      </TabsContent>
      <TabsContent value="ordenes" className="mt-6">
        <OrdersList />
      </TabsContent>
      <TabsContent value="pautas" className="mt-6">
        <PautasPanel />
      </TabsContent>
      <TabsContent value="checklists" className="mt-6">
        <MaintenanceChecklistEditor />
      </TabsContent>
    </Tabs>
  );
}

export default function MaintenanceOrdenesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mantenimiento</h1>
          <p className="text-sm text-muted-foreground mt-1">Qué necesita atención, y el historial completo de órdenes</p>
        </div>
        <Suspense fallback={<div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}>
          <MantencionTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

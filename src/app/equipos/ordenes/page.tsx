'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, TriangleAlert, ListChecks, CalendarClock } from 'lucide-react';
import { VencimientosPanel } from '@/components/maintenance/VencimientosPanel';
import { PautasPanel } from '@/components/maintenance/PautasPanel';
import { OrdenesPanel } from '@/components/maintenance/OrdenesPanel';
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';

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
        <OrdenesPanel />
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

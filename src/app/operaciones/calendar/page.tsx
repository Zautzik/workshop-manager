'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { GanttChart, Cpu, CalendarDays, CalendarRange } from 'lucide-react';
import { OTGanttBoard } from '@/components/workflow/OTGanttBoard';
import { ShiftManagement } from '@/components/workflow/ShiftManagement';
import { UnifiedCalendar } from '@/components/UnifiedCalendar';
import { PlanSemanal } from '@/components/workflow/PlanSemanal';

const VALID_TABS = ['cronograma', 'maquinas', 'calendario', 'semanal'] as const;
type TabKey = (typeof VALID_TABS)[number];

function PlanificacionTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'cronograma';

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/operaciones/calendar?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-4">
        <TabsTrigger value="cronograma" className="gap-2">
          <GanttChart className="h-4 w-4" /> Cronograma
        </TabsTrigger>
        <TabsTrigger value="maquinas" className="gap-2">
          <Cpu className="h-4 w-4" /> Máquinas
        </TabsTrigger>
        <TabsTrigger value="calendario" className="gap-2">
          <CalendarDays className="h-4 w-4" /> Calendario
        </TabsTrigger>
        <TabsTrigger value="semanal" className="gap-2">
          <CalendarRange className="h-4 w-4" /> Semanal
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cronograma" className="mt-6">
        <OTGanttBoard />
      </TabsContent>
      <TabsContent value="maquinas" className="mt-6">
        <ShiftManagement onShiftChange={() => queryClient.invalidateQueries()} />
      </TabsContent>
      <TabsContent value="calendario" className="mt-6">
        <UnifiedCalendar />
      </TabsContent>
      <TabsContent value="semanal" className="mt-6">
        <PlanSemanal />
      </TabsContent>
    </Tabs>
  );
}

export default function PlanificacionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager', 'hr_manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planificación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cronograma de OTs, programación de máquinas, calendario y plan semanal
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <PlanificacionTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

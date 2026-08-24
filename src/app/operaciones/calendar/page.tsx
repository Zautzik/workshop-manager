'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
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
  const { role } = useAuth();
  // Cronograma, Máquinas y Semanal pegan contra /api/ot-schedule*, que sólo
  // acepta supervisor/admin/manager. La página igual dejaba entrar a
  // hr_manager con las cuatro pestañas visibles — llegaba a la que sí es
  // suya (Calendario, licencias) por las tres que le devuelven 403, y sin
  // isError en pantalla, un 403 se ve igual que una semana sin planificar
  // (auditoría 2026-08).
  const hrOnlyCalendar = role === 'hr_manager';
  const requested = params.get('tab');
  const defaultTab: TabKey = hrOnlyCalendar ? 'calendario' : 'cronograma';
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : defaultTab;

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/operaciones/calendar?${sp.toString()}`, { scroll: false });
  };

  if (hrOnlyCalendar) {
    return <UnifiedCalendar />;
  }

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
        <ShiftManagement />
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

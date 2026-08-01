'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Wrench, Users, Droplets } from 'lucide-react';
import { MecanicaPanel } from '@/components/maintenance/MecanicaPanel';
import { CompetenciasPanel } from '@/components/maintenance/CompetenciasPanel';
import { ConsumiblesPanel } from '@/components/maintenance/ConsumiblesPanel';

const VALID_TABS = ['piezas', 'consumibles', 'competencias'] as const;
type TabKey = (typeof VALID_TABS)[number];

function MecanicaTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'piezas';

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/equipos/mecanica?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-3">
        <TabsTrigger value="piezas" className="gap-2">
          <Wrench className="h-4 w-4" /> Piezas y repuestos
        </TabsTrigger>
        <TabsTrigger value="consumibles" className="gap-2">
          <Droplets className="h-4 w-4" /> Consumibles
        </TabsTrigger>
        <TabsTrigger value="competencias" className="gap-2">
          <Users className="h-4 w-4" /> Quién la opera
        </TabsTrigger>
      </TabsList>

      <TabsContent value="piezas" className="mt-6">
        <MecanicaPanel />
      </TabsContent>
      <TabsContent value="consumibles" className="mt-6">
        <ConsumiblesPanel />
      </TabsContent>
      <TabsContent value="competencias" className="mt-6">
        <CompetenciasPanel />
      </TabsContent>
    </Tabs>
  );
}

export default function MecanicaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mecánica y Abastecimiento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada máquina por sistema, y dentro de cada sistema sus piezas: cuánta vida les
            queda, cuánto demora el repuesto y si todavía se alcanza a pedir. Una máquina
            también se detiene cuando nadie sabe operarla — eso está en la segunda pestaña.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <MecanicaTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

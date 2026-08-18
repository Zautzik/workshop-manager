'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, FileSpreadsheet, ClipboardList } from 'lucide-react';
import { OrderLaborMarginAnalysis } from '@/components/financial/OrderLaborMarginAnalysis';
import { OTCostAnalysisReport } from '@/components/financial/OTCostAnalysisReport';
import { OTFinancialTracking } from '@/components/financial/OTFinancialTracking';
import AnalyticsFilterBar from '@/components/analitica/AnalyticsFilterBar';

// El orden importa: se aterriza en el margen del TRABAJO, no en una de sus
// partidas. La mano de obra es un componente del costo, no la pregunta —
// abrir en ella era heredado de cuando el módulo se organizaba por partida.
const VALID_TABS = ['seguimiento', 'costos', 'margenes'] as const;
type TabKey = (typeof VALID_TABS)[number];

function RentabilidadTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'seguimiento';

  // Keep the URL in sync so each tab is bookmarkable / shareable.
  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/analitica/rentabilidad?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-xl grid-cols-3">
        <TabsTrigger value="seguimiento" className="gap-2">
          <PieChart className="h-4 w-4" /> Margen por trabajo
        </TabsTrigger>
        <TabsTrigger value="costos" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Estimado vs real
        </TabsTrigger>
        <TabsTrigger value="margenes" className="gap-2">
          <ClipboardList className="h-4 w-4" /> Mano de obra
        </TabsTrigger>
      </TabsList>

      <TabsContent value="margenes" className="mt-6">
        <OrderLaborMarginAnalysis />
      </TabsContent>
      <TabsContent value="costos" className="mt-6">
        <OTCostAnalysisReport />
      </TabsContent>
      <TabsContent value="seguimiento" className="mt-6">
        <OTFinancialTracking />
      </TabsContent>
    </Tabs>
  );
}

export default function AnaliticaRentabilidadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="mx-auto max-w-[1400px] space-y-6 p-6 md:p-8">
        <AnalyticsFilterBar />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rentabilidad por OT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Márgenes, costos estimados vs reales y seguimiento financiero de cada orden
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <RentabilidadTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, TrendingUp, Scale } from 'lucide-react';
import { MachineCostAnalysis } from '@/components/financial/MachineCostAnalysis';
import { EquipmentInvestmentAnalysis } from '@/components/financial/EquipmentInvestmentAnalysis';
import { MachineEconomicsDrift } from '@/components/financial/MachineEconomicsDrift';

const VALID_TABS = ['costo', 'inversion', 'tarifa'] as const;
type TabKey = (typeof VALID_TABS)[number];

function EconomiaTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'costo';

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/equipos/economia?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-lg grid-cols-3">
        <TabsTrigger value="costo" className="gap-2">
          <Wallet className="h-4 w-4" /> Costo Operativo
        </TabsTrigger>
        <TabsTrigger value="inversion" className="gap-2">
          <TrendingUp className="h-4 w-4" /> Inversión / ROI
        </TabsTrigger>
        <TabsTrigger value="tarifa" className="gap-2">
          <Scale className="h-4 w-4" /> Tarifa vs. Catálogo
        </TabsTrigger>
      </TabsList>

      <TabsContent value="costo" className="mt-6">
        <MachineCostAnalysis />
      </TabsContent>
      <TabsContent value="inversion" className="mt-6">
        <EquipmentInvestmentAnalysis />
      </TabsContent>
      <TabsContent value="tarifa" className="mt-6">
        <MachineEconomicsDrift />
      </TabsContent>
    </Tabs>
  );
}

export default function EquiposEconomiaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Economía de Equipos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Costo operativo, depreciación y retorno de inversión por máquina
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <EconomiaTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

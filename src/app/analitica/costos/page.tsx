'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CostCenterManager } from '@/components/financial/CostCenterManager';
import { MaterialCostPanel } from '@/components/financial/MaterialCostPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings2, Package } from 'lucide-react';

export default function AnaliticaCostosPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Centro de Costos</h1>
            <p className="text-sm text-muted-foreground mt-1">Catálogo de tarifas (configuración) y costo real de materiales desde compras</p>
          </div>
          <Tabs defaultValue="catalogo">
            <TabsList>
              <TabsTrigger value="catalogo" className="gap-2"><Settings2 className="h-4 w-4" /> Catálogo de tarifas</TabsTrigger>
              <TabsTrigger value="real" className="gap-2"><Package className="h-4 w-4" /> Costo real (compras)</TabsTrigger>
            </TabsList>
            <TabsContent value="catalogo" className="mt-6"><CostCenterManager /></TabsContent>
            <TabsContent value="real" className="mt-6"><MaterialCostPanel /></TabsContent>
          </Tabs>
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

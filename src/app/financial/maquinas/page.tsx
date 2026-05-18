'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { MachineCostAnalysis } from '@/components/financial/MachineCostAnalysis';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinancialMaquinasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Costos de Máquinas</h1>
            <p className="text-sm text-muted-foreground mt-1">Análisis de costo operativo por equipo</p>
          </div>
          <MachineCostAnalysis />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

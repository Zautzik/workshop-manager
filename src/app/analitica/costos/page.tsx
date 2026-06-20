'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CostCenterManager } from '@/components/financial/CostCenterManager';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnaliticaCostosPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Centro de Costos</h1>
            <p className="text-sm text-muted-foreground mt-1">Configuración y análisis por centro de costo</p>
          </div>
          <CostCenterManager />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

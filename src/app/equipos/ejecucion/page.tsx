'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import WorkOrderExecution from '@/components/maintenance/WorkOrderExecution';
import { Skeleton } from '@/components/ui/skeleton';

export default function MaintenanceEjecucionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ejecución de Órdenes</h1>
            <p className="text-sm text-muted-foreground mt-1">Ejecutar y cerrar órdenes de trabajo activas</p>
          </div>
          <WorkOrderExecution />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

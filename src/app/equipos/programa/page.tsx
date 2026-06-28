'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import MaintenanceProgramView from '@/components/maintenance/MaintenanceProgramView';
import { Skeleton } from '@/components/ui/skeleton';

export default function MaintenanceProgramaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Programa de Mantenimiento</h1>
            <p className="text-sm text-muted-foreground mt-1">Tareas programadas por frecuencia y equipo</p>
          </div>
          <MaintenanceProgramView />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

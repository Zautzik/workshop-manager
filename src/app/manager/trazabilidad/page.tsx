'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import TraceabilityReport from '@/components/manager/TraceabilityReport';

export default function ManagerTrazabilidadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trazabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1">Seguimiento completo del ciclo de cada OT</p>
        </div>
        <TraceabilityReport />
      </div>
    </ProtectedRoute>
  );
}

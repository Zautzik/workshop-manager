'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import OTLifecycleReport from '@/components/manager/OTLifecycleReport';

export default function AnaliticaTrazabilidadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ciclo de OT</h1>
          <p className="text-sm text-muted-foreground mt-1">Lead time, cuellos de botella y recorrido completo de cada orden</p>
        </div>
        <OTLifecycleReport />
      </div>
    </ProtectedRoute>
  );
}

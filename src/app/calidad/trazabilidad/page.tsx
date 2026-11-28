'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import OTLifecycleReport from '@/components/manager/OTLifecycleReport';
import { PageShell } from '@/components/layout/PageShell';

export default function CalidadTrazabilidadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Ciclo de OT</h1>
          <p className="text-sm text-muted-foreground mt-1">Lead time, cuellos de botella y recorrido completo de cada orden</p>
        </div>
        <OTLifecycleReport />
      </PageShell>
    </ProtectedRoute>
  );
}

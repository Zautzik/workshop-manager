'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { HistorialPanel } from '@/components/maintenance/HistorialPanel';
import { PageShell } from '@/components/layout/PageShell';

export default function MaintenanceHistorialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Historial & KPIs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Disponibilidad de la flota, MTBF, MTTR y el registro completo de mantenimientos completados
          </p>
        </div>
        <HistorialPanel />
      </PageShell>
    </ProtectedRoute>
  );
}

'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import WorkerStatsReport from '@/components/manager/WorkerStatsReport';
import { PageShell } from '@/components/layout/PageShell';

export default function AnaliticaRendimientoPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Rendimiento Personal</h1>
          <p className="text-sm text-muted-foreground mt-1">Estadísticas y métricas de trabajadores</p>
        </div>
        <WorkerStatsReport />
      </PageShell>
    </ProtectedRoute>
  );
}

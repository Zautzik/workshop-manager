'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TrendsDashboard } from '@/components/analitica/TrendsDashboard';
import { PageShell } from '@/components/layout/PageShell';

export default function ManagerTendenciasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Tendencias</h1>
          <p className="text-sm text-muted-foreground mt-1">Análisis de tendencias históricas de producción</p>
        </div>
        <TrendsDashboard />
      </PageShell>
    </ProtectedRoute>
  );
}

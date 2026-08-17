'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TrendsDashboard } from '@/components/analitica/TrendsDashboard';

export default function ManagerTendenciasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tendencias</h1>
          <p className="text-sm text-muted-foreground mt-1">Análisis de tendencias históricas de producción</p>
        </div>
        <TrendsDashboard />
      </div>
    </ProtectedRoute>
  );
}

'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import WorkerStatsReport from '@/components/manager/WorkerStatsReport';

export default function ManagerTrabajadoresPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rendimiento Personal</h1>
          <p className="text-sm text-muted-foreground mt-1">Estadísticas y métricas de trabajadores</p>
        </div>
        <WorkerStatsReport />
      </div>
    </ProtectedRoute>
  );
}

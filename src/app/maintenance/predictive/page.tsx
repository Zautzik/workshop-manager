'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { PredictiveMaintenancePanel } from '@/components/maintenance/PredictiveMaintenancePanel';

export default function PredictiveMaintenancePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor', 'manager']}>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Mantenimiento Predictivo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Estado de carga acumulada por equipo y alertas de servicio próximo
          </p>
        </div>
        <PredictiveMaintenancePanel />
      </div>
    </ProtectedRoute>
  );
}

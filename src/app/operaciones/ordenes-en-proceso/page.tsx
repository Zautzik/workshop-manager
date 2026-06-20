'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { OrdenesEnProceso } from '@/components/workflow/OrdenesEnProceso';

export default function OrdenesEnProcesoPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Órdenes en Proceso</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista global de todas las órdenes activas en planta
          </p>
        </div>
        <OrdenesEnProceso />
      </div>
    </ProtectedRoute>
  );
}

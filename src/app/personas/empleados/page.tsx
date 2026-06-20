'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import WorkersManagement from '@/components/admin/WorkersManagement';
import { useQueryClient } from '@tanstack/react-query';

export default function HREmpleadosPage() {
  const queryClient = useQueryClient();
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Directorio de Empleados</h1>
          <p className="text-sm text-muted-foreground mt-1">Perfiles, datos y estado de cada empleado</p>
        </div>
        <WorkersManagement onUpdate={() => queryClient.invalidateQueries()} />
      </div>
    </ProtectedRoute>
  );
}

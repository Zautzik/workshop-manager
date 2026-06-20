'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ShiftManagement } from '@/components/workflow/ShiftManagement';
import { useQueryClient } from '@tanstack/react-query';

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Turnos</h1>
          <p className="text-sm text-muted-foreground mt-1">Asignación de turnos y máquinas activas</p>
        </div>
        <ShiftManagement onShiftChange={() => queryClient.invalidateQueries()} />
      </div>
    </ProtectedRoute>
  );
}

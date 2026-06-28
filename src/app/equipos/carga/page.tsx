'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import MachineActivityReport from '@/components/maintenance/MachineActivityReport';

export default function EquiposCargaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carga & Utilización</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Carga real de cada máquina derivada de la producción (horas, OTs y trabajo activo)
          </p>
        </div>
        <MachineActivityReport />
      </div>
    </ProtectedRoute>
  );
}

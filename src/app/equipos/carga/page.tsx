'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import MachineActivityReport from '@/components/maintenance/MachineActivityReport';
import { PageShell } from '@/components/layout/PageShell';

export default function EquiposCargaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Carga & Utilización</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Carga real de cada máquina derivada de la producción (horas, OTs y trabajo activo)
          </p>
        </div>
        <MachineActivityReport />
      </PageShell>
    </ProtectedRoute>
  );
}

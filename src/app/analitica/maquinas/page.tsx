'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import MachineEconomicsSummary from '@/components/analitica/MachineEconomicsSummary';
import { PageShell } from '@/components/layout/PageShell';

export default function AnaliticaMaquinasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Economía de Equipos</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de costos e inversión de la flota</p>
        </div>
        <MachineEconomicsSummary />
      </PageShell>
    </ProtectedRoute>
  );
}

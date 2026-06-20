'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import MachineEconomicsSummary from '@/components/analitica/MachineEconomicsSummary';

export default function AnaliticaMaquinasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Economía de Equipos</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de costos e inversión de la flota</p>
        </div>
        <MachineEconomicsSummary />
      </div>
    </ProtectedRoute>
  );
}

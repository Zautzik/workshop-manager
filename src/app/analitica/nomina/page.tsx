'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import LaborCostSummary from '@/components/analitica/LaborCostSummary';

export default function AnaliticaNominaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Costo Laboral</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de nómina del mes; detalle completo en Personas</p>
        </div>
        <LaborCostSummary />
      </div>
    </ProtectedRoute>
  );
}

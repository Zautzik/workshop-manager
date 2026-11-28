'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import LaborCostSummary from '@/components/analitica/LaborCostSummary';
import { PageShell } from '@/components/layout/PageShell';

export default function AnaliticaNominaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Costo Laboral</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de nómina del mes; detalle completo en Personas</p>
        </div>
        <LaborCostSummary />
      </PageShell>
    </ProtectedRoute>
  );
}

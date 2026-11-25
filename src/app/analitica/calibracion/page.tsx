'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CalibracionMotor } from '@/components/workflow/CalibracionMotor';
import { PageShell } from '@/components/layout/PageShell';

export default function CalibracionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Calibración del Motor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contrasta el motor de costeo contra trabajos reales antes de confiar en un presupuesto
          </p>
        </div>
        <CalibracionMotor />
      </PageShell>
    </ProtectedRoute>
  );
}

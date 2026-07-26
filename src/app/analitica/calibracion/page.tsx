'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CalibracionMotor } from '@/components/workflow/CalibracionMotor';

export default function CalibracionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calibración del Motor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contrasta el motor de costeo contra trabajos reales antes de confiar en un presupuesto
          </p>
        </div>
        <CalibracionMotor />
      </div>
    </ProtectedRoute>
  );
}

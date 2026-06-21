'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import RecallReport from '@/components/calidad/RecallReport';

export default function CalidadRecallPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Simulacro de Retiro</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trazabilidad hacia adelante FSSC 22000: del lote a las OTs y clientes afectados (mock recall)
          </p>
        </div>
        <RecallReport />
      </div>
    </ProtectedRoute>
  );
}

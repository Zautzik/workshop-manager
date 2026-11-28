'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import RecallReport from '@/components/calidad/RecallReport';
import { PageShell } from '@/components/layout/PageShell';

export default function CalidadRecallPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Simulacro de Retiro</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trazabilidad hacia adelante FSSC 22000: del lote a las OTs y clientes afectados (mock recall)
          </p>
        </div>
        <RecallReport />
      </PageShell>
    </ProtectedRoute>
  );
}

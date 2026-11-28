'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import ExpedienteReport from '@/components/calidad/ExpedienteReport';
import { PageShell } from '@/components/layout/PageShell';

export default function CalidadExpedientePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Expediente de OT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trazabilidad documental FSSC 22000: insumos, certificados, evidencia del entregable y conformidad
          </p>
        </div>
        <ExpedienteReport />
      </PageShell>
    </ProtectedRoute>
  );
}

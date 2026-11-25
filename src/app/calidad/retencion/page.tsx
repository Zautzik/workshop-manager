'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import RetentionReport from '@/components/calidad/RetentionReport';
import { PageShell } from '@/components/layout/PageShell';

export default function CalidadRetencionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Retención de Registros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control de documentos FSSC 22000: conservación de registros de trazabilidad por 5 años
          </p>
        </div>
        <RetentionReport />
      </PageShell>
    </ProtectedRoute>
  );
}

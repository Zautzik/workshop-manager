'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import CertificacionesReport from '@/components/calidad/CertificacionesReport';

export default function CalidadCertificacionesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificaciones de Insumos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro FSSC 22000 de materiales con certificación: vigencia, vencimientos y lotes en riesgo
          </p>
        </div>
        <CertificacionesReport />
      </div>
    </ProtectedRoute>
  );
}

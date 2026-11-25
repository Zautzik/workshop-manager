'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import IntegrationsManagement from '@/components/admin/IntegrationsManagement';
import { FacturacionElectronicaCard } from '@/components/admin/FacturacionElectronicaCard';

export default function IntegrationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integraciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Conectores ERP, pagos y servicios externos.</p>
        </div>
        <FacturacionElectronicaCard />
        <IntegrationsManagement />
      </div>
    </ProtectedRoute>
  );
}

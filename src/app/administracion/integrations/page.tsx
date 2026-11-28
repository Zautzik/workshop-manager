'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import IntegrationsManagement from '@/components/admin/IntegrationsManagement';
import { FacturacionElectronicaCard } from '@/components/admin/FacturacionElectronicaCard';
import { PageShell } from '@/components/layout/PageShell';

export default function IntegrationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Integraciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Conectores ERP, pagos y servicios externos.</p>
        </div>
        <FacturacionElectronicaCard />
        <IntegrationsManagement />
      </PageShell>
    </ProtectedRoute>
  );
}

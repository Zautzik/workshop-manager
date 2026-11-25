'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { ClientManager } from '@/components/workflow/ClientManager';
import { PageShell } from '@/components/layout/PageShell';

export default function ComercialClientesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <PageShell>
        <ClientManager />
      </PageShell>
    </ProtectedRoute>
  );
}

'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { ClientManager } from '@/components/workflow/ClientManager';

export default function ComercialClientesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-4 md:p-6">
        <ClientManager />
      </div>
    </ProtectedRoute>
  );
}

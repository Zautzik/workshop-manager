'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WorkflowDashboard from '@/page-components/WorkflowDashboard';

export default function ComercialClientesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <WorkflowDashboard initialTab="clients" />
    </ProtectedRoute>
  );
}

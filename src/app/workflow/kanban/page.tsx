'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WorkflowDashboard from '@/page-components/WorkflowDashboard';

export default function KanbanPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <WorkflowDashboard initialTab="ots" />
    </ProtectedRoute>
  );
}

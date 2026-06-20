/**
 * @fileoverview Planta — Classic Workshop Floor Scheduler
 *
 * Restores the original drag/drop scheduling and workstation layout.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WorkflowDashboard from '@/page-components/WorkflowDashboard';

export default function PlantaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <WorkflowDashboard initialTab="layout" />
    </ProtectedRoute>
  );
}

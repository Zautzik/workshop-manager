/**
 * @fileoverview Planta — Classic Workshop Floor Scheduler
 *
 * Drag/drop scheduling and workstation layout (formerly the WorkflowDashboard
 * monolith, now a focused planta board).
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import PlantaBoard from '@/page-components/PlantaBoard';

export default function PlantaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <PlantaBoard />
    </ProtectedRoute>
  );
}

/**
 * @fileoverview HR Manager Page
 * 
 * SYSTEM ROLE: HR Management Hub
 * ORGAN ANALOGY: The "People Ops Center" - Employee lifecycle management
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import HrManagerDashboard from '@/page-components/HrManagerDashboard';

export default function HrPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <HrManagerDashboard />
    </ProtectedRoute>
  );
}

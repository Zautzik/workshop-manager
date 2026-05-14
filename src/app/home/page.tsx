'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import HomeDashboard from '@/page-components/HomeDashboard';

export default function HomePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'hr_manager', 'technician']}>
      <HomeDashboard />
    </ProtectedRoute>
  );
}

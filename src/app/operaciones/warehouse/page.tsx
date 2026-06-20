'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WarehouseDashboard from '@/components/workflow/WarehouseDashboard';

export default function WarehousePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <WarehouseDashboard />
      </div>
    </ProtectedRoute>
  );
}

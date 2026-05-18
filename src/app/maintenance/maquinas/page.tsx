'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { MachineManagementPanel } from '@/components/maintenance/MachineManagementPanel';
import { Skeleton } from '@/components/ui/skeleton';

export default function MaintenanceMachinesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <Suspense
        fallback={
          <div className="space-y-6 p-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        <div className="p-6 space-y-6">
          <MachineManagementPanel />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}
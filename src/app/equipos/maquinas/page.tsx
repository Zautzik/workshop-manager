'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { MachineManagementPanel } from '@/components/maintenance/MachineManagementPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';

export default function MaintenanceMachinesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <Suspense
        fallback={
          <PageShell>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-96 w-full" />
          </PageShell>
        }
      >
        <PageShell>
          <MachineManagementPanel />
        </PageShell>
      </Suspense>
    </ProtectedRoute>
  );
}
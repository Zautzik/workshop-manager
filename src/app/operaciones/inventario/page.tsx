'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import InventoryManagement from '@/components/admin/InventoryManagement';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';

export default function InventoryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Materiales, suministros y control de stock</p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <InventoryManagement />
        </Suspense>
      </PageShell>
    </ProtectedRoute>
  );
}

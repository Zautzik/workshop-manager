'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { OTFinancialTracking } from '@/components/financial/OTFinancialTracking';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinancialOTsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Seguimiento Financiero OT</h1>
            <p className="text-sm text-muted-foreground mt-1">Costos reales registrados por orden de trabajo</p>
          </div>
          <OTFinancialTracking />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

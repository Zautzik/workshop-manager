'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { OTCostAnalysisReport } from '@/components/financial/OTCostAnalysisReport';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinancialCostosOTPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Costos OT — Detalle</h1>
            <p className="text-sm text-muted-foreground mt-1">Reporte detallado de costos estimados vs reales</p>
          </div>
          <OTCostAnalysisReport />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

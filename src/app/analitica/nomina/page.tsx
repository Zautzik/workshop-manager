'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { MonthlyPayrollCalculator } from '@/components/financial/MonthlyPayrollCalculator';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnaliticaNominaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nómina Mensual</h1>
            <p className="text-sm text-muted-foreground mt-1">Cálculo y resumen de compensaciones del período</p>
          </div>
          <MonthlyPayrollCalculator />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { EquipmentInvestmentAnalysis } from '@/components/financial/EquipmentInvestmentAnalysis';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinancialInversionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inversión en Equipos</h1>
            <p className="text-sm text-muted-foreground mt-1">ROI, depreciación y análisis de inversión por máquina</p>
          </div>
          <EquipmentInvestmentAnalysis />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

'use client';

import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';
import AnalyticsFilterBar from '@/components/analitica/AnalyticsFilterBar';

const ExecutiveOverview = dynamic(() => import('@/components/admin/ExecutiveOverview'));
const AlarmasDeCosto = dynamic(
  () => import('@/components/analitica/AlarmasDeCosto').then((m) => m.AlarmasDeCosto),
);

export default function AnaliticaDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 md:p-8 space-y-6">
        <AnalyticsFilterBar />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resumen Ejecutivo</h1>
          <p className="text-sm text-muted-foreground mt-1">Vista general del estado operativo</p>
        </div>
        {/* Lo que pierde plata va antes que cualquier KPI: una alarma que hay
            que ir a buscar no es una alarma. */}
        <AlarmasDeCosto />
        <ExecutiveOverview />
      </div>
    </ProtectedRoute>
  );
}

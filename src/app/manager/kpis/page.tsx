'use client';
import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';
const ExecutiveOverview = dynamic(() => import('@/components/admin/ExecutiveOverview'));

export default function ManagerKPIsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KPIs Operativos</h1>
          <p className="text-sm text-muted-foreground mt-1">Eficiencia, throughput y estado del taller</p>
        </div>
        <ExecutiveOverview />
      </div>
    </ProtectedRoute>
  );
}

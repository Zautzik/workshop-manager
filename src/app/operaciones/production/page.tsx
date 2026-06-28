'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import OTRetrievalSystem from '@/components/workflow/OTRetrievalSystem';

export default function ProductionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Archivo OT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Archivo histórico de órdenes de producción
          </p>
        </div>
        <OTRetrievalSystem />
      </div>
    </ProtectedRoute>
  );
}

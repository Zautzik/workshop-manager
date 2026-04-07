'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WorkersManagement from '@/components/admin/WorkersManagement';

export default function WorkersPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Operarios</h1>
          <p className="text-sm text-muted-foreground mt-1">Administrar personal de producción</p>
        </div>
        <WorkersManagement onUpdate={() => {}} />
      </div>
    </ProtectedRoute>
  );
}

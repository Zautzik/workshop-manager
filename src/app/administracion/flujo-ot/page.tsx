'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { RoleTransitionsMatrix } from '@/components/admin/RoleTransitionsMatrix';

export default function FlujoOTPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reglas de flujo de OT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Qué rol puede mover una OT a cada estado del Kanban — configurable, sin desplegar código.
          </p>
        </div>
        <RoleTransitionsMatrix />
      </div>
    </ProtectedRoute>
  );
}

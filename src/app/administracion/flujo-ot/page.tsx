'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { RoleTransitionsMatrix } from '@/components/admin/RoleTransitionsMatrix';
import { PageShell } from '@/components/layout/PageShell';

export default function FlujoOTPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Reglas de flujo de OT</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Qué rol puede mover una OT a cada estado del Kanban — configurable, sin desplegar código.
          </p>
        </div>
        <RoleTransitionsMatrix />
      </PageShell>
    </ProtectedRoute>
  );
}

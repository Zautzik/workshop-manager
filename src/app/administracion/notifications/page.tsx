'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import NotificationsManagement from '@/components/admin/NotificationsManagement';
import { PageShell } from '@/components/layout/PageShell';

export default function NotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager', 'hr_manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Notificaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial completo, busqueda y gestion de estado de lectura.
          </p>
        </div>
        <NotificationsManagement />
      </PageShell>
    </ProtectedRoute>
  );
}

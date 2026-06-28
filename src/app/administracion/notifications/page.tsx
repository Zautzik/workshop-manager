'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import NotificationsManagement from '@/components/admin/NotificationsManagement';

export default function NotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager', 'hr_manager']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial completo, busqueda y gestion de estado de lectura.
          </p>
        </div>
        <NotificationsManagement />
      </div>
    </ProtectedRoute>
  );
}

'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import UserManagement from '@/components/admin/UserManagement';
import { PageShell } from '@/components/layout/PageShell';

export default function UsersPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-1">Administrar cuentas y roles del sistema</p>
        </div>
        <UserManagement onUpdate={() => {}} />
      </PageShell>
    </ProtectedRoute>
  );
}

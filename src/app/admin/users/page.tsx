'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import UserManagement from '@/components/admin/UserManagement';

export default function UsersPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-1">Administrar cuentas y roles del sistema</p>
        </div>
        <UserManagement onUpdate={() => {}} />
      </div>
    </ProtectedRoute>
  );
}

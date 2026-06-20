'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import PurchasesManagement from '@/components/admin/PurchasesManagement';

export default function PurchasesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">Órdenes de compra y proveedores</p>
        </div>
        <PurchasesManagement />
      </div>
    </ProtectedRoute>
  );
}

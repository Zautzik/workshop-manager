'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import InventoryManagement from '@/components/admin/InventoryManagement';

export default function InventoryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Materiales, suministros y control de stock</p>
        </div>
        <InventoryManagement />
      </div>
    </ProtectedRoute>
  );
}

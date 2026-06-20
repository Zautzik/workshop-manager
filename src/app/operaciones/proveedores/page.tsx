'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { Truck } from 'lucide-react';

export default function SuppliersPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="px-6 pt-6 pb-10 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-violet-500/10 p-3">
            <Truck className="w-6 h-6 text-violet-400" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Proveedores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Directorio y condiciones comerciales de proveedores</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center">
          <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Módulo en desarrollo</p>
          <p className="text-xs text-muted-foreground mt-1">El directorio de proveedores estará disponible próximamente.</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}

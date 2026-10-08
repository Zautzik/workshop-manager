'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { FileSpreadsheet } from 'lucide-react';
import CotizacionesModule from '@/page-components/CotizacionesModule';

export default function CotizacionesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'vendedor']}>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-cyan-500/10 p-3"><FileSpreadsheet className="w-6 h-6 text-cyan-500" /></span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cotizaciones</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Cotizá y creá la orden. El visto bueno se firma después, sobre la prueba que sale de Pre-Prensa.</p>
          </div>
        </div>
        <CotizacionesModule />
      </div>
    </ProtectedRoute>
  );
}

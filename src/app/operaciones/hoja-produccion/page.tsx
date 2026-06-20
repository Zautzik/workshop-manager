'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { HojaProduccion } from '@/components/workflow/HojaProduccion';

export default function HojaProduccionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hoja de Producción</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planificación diaria por máquina con tiempos estimados y flags de control
          </p>
        </div>
        <HojaProduccion />
      </div>
    </ProtectedRoute>
  );
}

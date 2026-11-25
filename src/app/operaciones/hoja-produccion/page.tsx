'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { HojaProduccion } from '@/components/workflow/HojaProduccion';
import { PageShell } from '@/components/layout/PageShell';

export default function HojaProduccionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <PageShell>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Hoja de Producción</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planificación diaria por máquina con tiempos estimados y avance de cada OT
          </p>
        </div>
        <HojaProduccion />
      </PageShell>
    </ProtectedRoute>
  );
}

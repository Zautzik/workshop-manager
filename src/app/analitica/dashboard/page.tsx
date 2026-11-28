'use client';

import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';
import AnalyticsFilterBar from '@/components/analitica/AnalyticsFilterBar';
import { PageShell } from '@/components/layout/PageShell';

// Las alarmas de costo viven DENTRO del Resumen, junto a los plazos: lo que
// pierde plata y lo que llega tarde se miran lado a lado, no uno debajo del
// otro ocupando cada uno la pantalla.
const ResumenEjecutivo = dynamic(() => import('@/components/analitica/ResumenEjecutivo'));

export default function AnaliticaDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <PageShell>
        <AnalyticsFilterBar />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Resumen</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">El estado del taller en una pantalla: plata, plazos y producción.</p>
        </div>
        <ResumenEjecutivo />
      </PageShell>
    </ProtectedRoute>
  );
}

'use client';

import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';
import AnalyticsFilterBar from '@/components/analitica/AnalyticsFilterBar';

// Las alarmas de costo viven DENTRO del Resumen, junto a los plazos: lo que
// pierde plata y lo que llega tarde se miran lado a lado, no uno debajo del
// otro ocupando cada uno la pantalla.
const ResumenEjecutivo = dynamic(() => import('@/components/analitica/ResumenEjecutivo'));

export default function AnaliticaDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      {/* p-6 md:p-8 no es estético: AnalyticsFilterBar sangra con -mx-6 /
          md:-mx-8 hasta el borde, y con otro padding desborda 8px. */}
      <div className="space-y-4 p-6 md:p-8">
        <AnalyticsFilterBar />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resumen</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">El estado del taller en una pantalla: plata, plazos y producción.</p>
        </div>
        <ResumenEjecutivo />
      </div>
    </ProtectedRoute>
  );
}

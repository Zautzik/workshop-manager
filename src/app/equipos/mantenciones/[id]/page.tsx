'use client';

/**
 * A esta pantalla se llega escaneando el QR pegado en la máquina y tocando
 * "Mantenciones pendientes" en el menú (/equipos/lectura/[id]). Ver
 * MachinePendingMaintenance.tsx para el contenido real.
 */

import { use } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { MachinePendingMaintenance } from '@/components/maintenance/MachinePendingMaintenance';

export default function MantencionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'technician']}>
      <div className="min-h-screen bg-background">
        <MachinePendingMaintenance id={id} />
      </div>
    </ProtectedRoute>
  );
}

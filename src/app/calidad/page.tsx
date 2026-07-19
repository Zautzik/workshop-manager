'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import { getModule } from '@/lib/navigation';

const mod = getModule('calidad')!;

export default function CalidadPage() {
  return (
    <ProtectedRoute allowedRoles={mod.roles}>
      <ModuleHexLanding title={mod.label} subtitle={mod.subtitle} groups={mod.groups} tint={mod.tint} />
    </ProtectedRoute>
  );
}

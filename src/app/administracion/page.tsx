/**
 * @fileoverview Administración Landing Page
 * Sections come from the single navigation source of truth (src/lib/navigation.ts).
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import { getModule } from '@/lib/navigation';

const mod = getModule('administracion')!;

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={mod.roles}>
      <ModuleHexLanding title={mod.label} subtitle={mod.subtitle} groups={mod.groups} />
    </ProtectedRoute>
  );
}

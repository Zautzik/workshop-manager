'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import PersonasModule from '@/page-components/PersonasModule';
import { getModule } from '@/lib/navigation';

const mod = getModule('personas')!;

export default function HrPage() {
  return (
    <ProtectedRoute allowedRoles={mod.roles}>
      <PersonasModule />
    </ProtectedRoute>
  );
}

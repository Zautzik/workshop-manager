'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { OTManagement } from '@/components/workflow/OTManagement';
import { PageShell } from '@/components/layout/PageShell';

export default function KanbanPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <PageShell>
        {/* Standalone kanban board. OT selection fed the (separate) planta
            assignment view in the old monolith — a no-op here. */}
        <OTManagement onOTSelect={() => {}} />
      </PageShell>
    </ProtectedRoute>
  );
}

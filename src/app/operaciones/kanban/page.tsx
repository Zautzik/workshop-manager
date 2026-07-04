'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { OTManagement } from '@/components/workflow/OTManagement';

export default function KanbanPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-4 md:p-6">
        {/* Standalone kanban board. OT selection fed the (separate) planta
            assignment view in the old monolith — a no-op here. */}
        <OTManagement onOTSelect={() => {}} />
      </div>
    </ProtectedRoute>
  );
}

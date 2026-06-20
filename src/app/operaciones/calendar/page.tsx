'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { UnifiedCalendar } from '@/components/UnifiedCalendar';

export default function WorkflowCalendarPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager', 'hr_manager']}>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Calendario Unificado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vencimientos OT, mantenimiento programado y licencias aprobadas
          </p>
        </div>
        <UnifiedCalendar />
      </div>
    </ProtectedRoute>
  );
}

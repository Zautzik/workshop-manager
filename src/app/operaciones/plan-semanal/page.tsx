'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { PlanSemanal } from '@/components/workflow/PlanSemanal';

export default function PlanSemanalPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plan Semanal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Matriz semanal por maquina para planificacion y revision impresa
          </p>
        </div>
        <PlanSemanal />
      </div>
    </ProtectedRoute>
  );
}

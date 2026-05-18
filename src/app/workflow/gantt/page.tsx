'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { OTGanttBoard } from '@/components/workflow/OTGanttBoard';

export default function GanttPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Gantt — Programación de OTs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Línea de tiempo de órdenes activas para las próximas 4 semanas
          </p>
        </div>
        <OTGanttBoard />
      </div>
    </ProtectedRoute>
  );
}

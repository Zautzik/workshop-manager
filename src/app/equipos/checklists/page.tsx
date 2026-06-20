/**
 * @fileoverview Maintenance Checklist Management Page
 * 
 * SYSTEM ROLE: Maintenance Planning Interface
 * 
 * Features:
 * - Full checklist CRUD operations
 * - Drag-and-drop task reordering
 * - Print-friendly preview
 * - Template duplication
 * - Real-time editing
 */
'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';
import { Skeleton } from '@/components/ui/skeleton';

export default function MaintenanceChecklistPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <Suspense
        fallback={
          <div className="space-y-6 p-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        <div className="p-6 space-y-6">
          <MaintenanceChecklistEditor />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}

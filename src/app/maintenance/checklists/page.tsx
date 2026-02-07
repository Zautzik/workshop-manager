/**
 * @fileoverview Maintenance Checklist Management Page
 * 
 * SYSTEM ROLE: Maintenance Planning Interface
 * ORGAN ANALOGY: The "Surgery Suite" - Where maintenance procedures are designed and prepared
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
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';
import { Skeleton } from '@/components/ui/skeleton';

export default function MaintenanceChecklistPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 p-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <MaintenanceChecklistEditor />
    </Suspense>
  );
}

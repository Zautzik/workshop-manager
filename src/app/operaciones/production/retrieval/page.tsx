/**
 * @fileoverview Production OT Retrieval Page
 * 
 * Dedicated full-page route for searching, viewing, and printing
 * production-level work orders.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import OTRetrievalSystem from '@/components/workflow/OTRetrievalSystem';

export default function ProductionOTRetrievalPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <OTRetrievalSystem />
      </div>
    </ProtectedRoute>
  );
}

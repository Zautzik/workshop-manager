/**
 * @fileoverview Production OT Retrieval Page
 * 
 * Dedicated full-page route for searching, viewing, and printing
 * production-level work orders.
 */
'use client';

import OTRetrievalSystem from '@/components/workflow/OTRetrievalSystem';

export default function ProductionOTRetrievalPage() {
  return (
    <div className="min-h-screen bg-background">
      <OTRetrievalSystem />
    </div>
  );
}

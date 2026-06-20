/**
 * @fileoverview Supervisor Dashboard Page
 * 
 * SYSTEM ROLE: Supervisor Management Center
 * 
 * This page is accessible to supervisors and provides:
 * - Team performance monitoring
 * - Job assignment and tracking
 * - Worker activity oversight
 * - Production metrics and KPIs
 * - Shift scheduling and roster management
 * - Quality assurance monitoring
 * 
 * Supervisors use this dashboard to manage daily operations and worker teams.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Supervisors now work from the Workflow module.
// This route is kept for backward-compatibility and redirects seamlessly.
export default function SupervisorPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/operaciones'); }, [router]);
  return null;
}

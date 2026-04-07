/**
 * @fileoverview Workflow Management Dashboard
 * 
 * SYSTEM ROLE: Job & Task Orchestration
 * ORGAN ANALOGY: The "Assembly Line" - Orchestrates and tracks all work processes
 * 
 * This page manages job workflows:
 * - Job creation and assignment
 * - Task status tracking (pending, in-progress, completed)
 * - Job queue and priority management
 * - Worker task assignment
 * - Workflow progress visualization
 * - Job completion tracking
 * - Performance metrics by workflow
 * 
 * Central hub for tracking all work orders and production jobs through completion.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WorkflowDashboard from "@/page-components/WorkflowDashboard";

export default function WorkflowPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <WorkflowDashboard />
    </ProtectedRoute>
  );
}

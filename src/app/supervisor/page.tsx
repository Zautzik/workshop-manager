/**
 * @fileoverview Supervisor Dashboard Page
 * 
 * SYSTEM ROLE: Supervisor Management Center
 * ORGAN ANALOGY: The "Foreman's Office" - Oversight hub for workshop supervisors
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

import SupervisorDashboard from "@/page-components/SupervisorDashboard";

export default function SupervisorPage() {
  return <SupervisorDashboard />;
}

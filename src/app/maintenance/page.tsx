/**
 * @fileoverview Maintenance Management Dashboard
 * 
 * SYSTEM ROLE: Equipment Maintenance & Lifecycle Management
 * ORGAN ANALOGY: The "Medical Department" - Maintains equipment health and uptime
 * 
 * This dashboard manages all equipment maintenance:
 * - Machine maintenance schedules
 * - Maintenance history and logs
 * - Equipment downtime tracking
 * - Preventive maintenance planning
 * - Equipment status and health monitoring
 * - Service request management
 * - Maintenance cost tracking
 * 
 * Ensures production equipment operates reliably and efficiently.
 */
'use client';

import MaintenanceDashboard from "@/page-components/MaintenanceDashboard";

export default function MaintenancePage() {
  return <MaintenanceDashboard />;
}

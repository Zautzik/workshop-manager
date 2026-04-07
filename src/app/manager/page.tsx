/**
 * @fileoverview Manager Dashboard Page
 * 
 * SYSTEM ROLE: Management & Operations Hub
 * ORGAN ANALOGY: The "Operations Center" - Strategic management and resource oversight
 * 
 * This page is accessible to managers and includes:
 * - Overall workshop operations overview
 * - Resource allocation and planning
 * - Budget and cost tracking
 * - Equipment maintenance scheduling
 * - Team productivity metrics
 * - Strategic reporting and insights
 * 
 * Managers use this to oversee operations and make strategic decisions.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ManagerDashboard from "@/page-components/ManagerDashboard";

export default function ManagerPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ManagerDashboard />
    </ProtectedRoute>
  );
}

/**
 * @fileoverview Admin Dashboard Page
 * 
 * SYSTEM ROLE: Admin Control Center
 * ORGAN ANALOGY: The "Command Center" - Central hub for system administrators
 * 
 * This page is accessible only to admin users (role-based access control enforced).
 * It provides:
 * - System-wide statistics and monitoring
 * - User and role management
 * - System settings and configurations
 * - Access to all data management modules
 * - Reporting and analytics
 * 
 * Admins can view and manage all aspects of the GonsAdmin application from this dashboard.
 */
'use client';

import AdminDashboard from "@/page-components/AdminDashboard";

export default function AdminPage() {
  return <AdminDashboard />;
}

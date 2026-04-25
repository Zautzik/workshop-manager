/**
 * @fileoverview Financial Report Page
 * 
 * SYSTEM ROLE: Financial Analytics & Reporting
 * ORGAN ANALOGY: The "Accounting Department" - Tracks all financial metrics and expenses
 * 
 * This page provides comprehensive financial tracking:
 * - Overtime (OT) costs by worker/department
 * - Equipment investment tracking
 * - Machine operating costs
 * - Cost-per-job analysis
 * - Budget vs. actual spending
 * - Financial dashboards and reports
 * - Export functionality for financial statements
 * 
 * Accessible to managers and admins for financial decision-making.
 */
'use client';

import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';

const FinancialReport = dynamic(() => import('@/page-components/FinancialReport'), {
  loading: () => <div className="p-8 text-muted-foreground text-sm">Cargando...</div>,
});

export default function FinancialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <FinancialReport />
    </ProtectedRoute>
  );
}

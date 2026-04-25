/**
 * @fileoverview HR Manager Page
 * 
 * SYSTEM ROLE: HR Management Hub
 * ORGAN ANALOGY: The "People Ops Center" - Employee lifecycle management
 */
'use client';

import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';

const HrManagerDashboard = dynamic(() => import('@/page-components/HrManagerDashboard'), {
  loading: () => <div className="p-8 text-muted-foreground text-sm">Cargando...</div>,
});

export default function HrPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <HrManagerDashboard />
    </ProtectedRoute>
  );
}

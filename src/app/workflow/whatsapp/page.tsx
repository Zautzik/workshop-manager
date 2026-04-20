/**
 * @fileoverview WhatsApp Production Tracking Page
 *
 * SYSTEM ROLE: Real-Time Production Data Capture via WhatsApp
 * ORGAN ANALOGY: The "Nervous System" - Instant feedback from the shop floor
 *
 * This page provides:
 * - Dashboard with real-time production status from operator WhatsApp messages
 * - Supervisor review queue for approving/rejecting production reports
 * - Manual entry interface for simulating operator messages
 * - Cost inference visualization with confidence scoring
 * - Full audit trail of all WhatsApp production interactions
 *
 * Flow:
 * 1. Operator sends "INICIO OT-1234" via WhatsApp → system logs start time
 * 2. Operator sends "FIN OT-1234 500 pliegos, 3 merma, doblado ok" → system parses data, infers costs
 * 3. Supervisor reviews parsed data & inferred costs → approves/rejects
 * 4. Approved data feeds into ot_real_costs for financial tracking
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import WhatsAppDashboard from '@/components/workflow/WhatsAppDashboard';

export default function WhatsAppPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            📱 WhatsApp — Control de Producción
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reportes de producción en tiempo real desde el taller. Los operarios envían inicio y fin de trabajo vía WhatsApp.
          </p>
        </div>
        <WhatsAppDashboard />
      </div>
    </ProtectedRoute>
  );
}

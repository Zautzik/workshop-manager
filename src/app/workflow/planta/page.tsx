/**
 * @fileoverview Planta Integrada — Live Workshop Floor
 * 
 * SYSTEM ROLE: The central integration view
 * 
 * Shows every workstation with its real machine (from Machines module),
 * assigned employees (People), active OT (Work Orders) and inventory
 * supply status — all live in a single floor view.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { PlantaIntegrada } from '@/components/workflow/PlantaIntegrada';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function PlantaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <TooltipProvider>
        <div className="p-6 md:p-8">
          <PlantaIntegrada />
        </div>
      </TooltipProvider>
    </ProtectedRoute>
  );
}

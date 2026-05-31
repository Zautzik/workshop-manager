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

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import {
  Cpu, ClipboardList, Wrench,
  BarChart3, AlertCircle,
} from 'lucide-react';

const groups = [
  {
    label: 'Flota & Mantenimiento',
    color: 'from-orange-500/10 to-rose-500/5',
    border: 'border-orange-500/20',
    heading: 'text-orange-400',
    items: [
      { label: 'Máquinas',     description: 'Registro, ficha técnica y estado de cada equipo',           icon: Cpu,         href: '/maintenance/maquinas',  color: 'bg-orange-500/10 text-orange-400'   },
      { label: 'Plan & Órdenes',description: 'OTs de mantenimiento, programa semanal y checklists',      icon: ClipboardList,href: '/maintenance/ordenes',   color: 'bg-sky-500/10 text-sky-400'        },
      { label: 'Ejecución',    description: 'Registro de intervenciones y trabajos realizados',           icon: Wrench,      href: '/maintenance/ejecucion', color: 'bg-fuchsia-500/10 text-fuchsia-400'},
    ],
  },
  {
    label: 'Análisis & Predictivo',
    color: 'from-violet-500/10 to-indigo-500/5',
    border: 'border-violet-500/20',
    heading: 'text-violet-400',
    items: [
      { label: 'Historial & KPIs',    description: 'Registro histórico, MTBF, MTTR y métricas de flota',   icon: BarChart3,   href: '/maintenance/historial', color: 'bg-indigo-500/10 text-indigo-400'},
      { label: 'Alertas & Predictivo',description: 'Avisos activos y mantenimiento preventivo/predictivo',  icon: AlertCircle, href: '/maintenance/alertas',   color: 'bg-amber-500/10 text-amber-400' },
    ],
  },
];

export default function MaintenancePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor', 'manager']}>
      <ModuleHexLanding
        title="Equipos"
        subtitle="Mantenimiento, órdenes de trabajo y gestión de la flota"
        groups={groups}
      />
    </ProtectedRoute>
  );
}

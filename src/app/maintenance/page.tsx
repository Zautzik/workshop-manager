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
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  Wrench, ClipboardList, Calendar, BarChart3,
  Cpu, BookOpen, AlertCircle, CheckCircle, TrendingUp,
} from 'lucide-react';

const sections = [
  { label: 'Máquinas',          description: 'Registro y estado de equipos',              icon: Cpu,           href: '/maintenance/maquinas',    rgb: '249 115 22'  },
  { label: 'Órdenes de Trabajo',description: 'Creación y seguimiento de OTs',              icon: ClipboardList, href: '/maintenance/ordenes',     rgb: '239 68 68'   },
  { label: 'Programa Semanal',  description: 'Planificación semanal de mantenimiento',    icon: Calendar,      href: '/maintenance/programa',    rgb: '6 182 212'   },
  { label: 'Checklists',        description: 'Listas de verificación por equipo',          icon: CheckCircle,   href: '/maintenance/checklists',  rgb: '34 197 94'   },
  { label: 'Historial',         description: 'Registro histórico de intervenciones',       icon: BookOpen,      href: '/maintenance/historial',   rgb: '99 102 241'  },
  { label: 'Alertas',           description: 'Avisos de mantenimiento pendientes',         icon: AlertCircle,   href: '/maintenance/alertas',     rgb: '245 158 11'  },
  { label: 'Estadísticas',      description: 'KPIs y métricas de mantenimiento',          icon: BarChart3,     href: '/maintenance/stats',       rgb: '139 92 246'  },
  { label: 'Ejecución',         description: 'Ejecución de órdenes de trabajo',            icon: Wrench,        href: '/maintenance/ejecucion',   rgb: '217 70 239'  },
  { label: 'Predictivo',        description: 'Carga acumulada y alertas de servicio',      icon: TrendingUp,    href: '/maintenance/predictive',  rgb: '16 185 129'  },
];

export default function MaintenancePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'supervisor']}>
      <ModuleLandingPage
        title="Máquinas"
        subtitle="Mantenimiento, órdenes de trabajo y gestión de equipos"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

/**
 * @fileoverview Workflow Management Dashboard
 * 
 * SYSTEM ROLE: Job & Task Orchestration
 * ORGAN ANALOGY: The "Assembly Line" - Orchestrates and tracks all work processes
 * 
 * This page manages job workflows:
 * - Job creation and assignment
 * - Task status tracking (pending, in-progress, completed)
 * - Job queue and priority management
 * - Worker task assignment
 * - Workflow progress visualization
 * - Job completion tracking
 * - Performance metrics by workflow
 * 
 * Central hub for tracking all work orders and production jobs through completion.
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  LayoutList, ClipboardList, Users2, Factory,
  Clock, FileSearch, FileSpreadsheet, CalendarDays,
  MessageSquare, Warehouse,
} from 'lucide-react';

const sections = [
  { label: 'Kanban',        description: 'Pipeline visual de OTs por estado',         icon: ClipboardList,   href: '/workflow/kanban',             rgb: '6 182 212'   },
  { label: 'En Proceso',    description: 'Lista activa con seguimiento de avance',     icon: LayoutList,      href: '/workflow/ordenes-en-proceso', rgb: '14 165 233'  },
  { label: 'Planta',        description: 'Piso: estaciones, turnos y equipo',          icon: Factory,         href: '/workflow/planta',             rgb: '16 185 129'  },
  { label: 'Turnos',        description: 'Asignación diaria de personal a máquinas',  icon: Clock,           href: '/workflow/shifts',             rgb: '245 158 11'  },
  { label: 'Plan Semanal',  description: 'Panorama y carga semanal de producción',    icon: CalendarDays,    href: '/workflow/plan-semanal',       rgb: '99 102 241'  },
  { label: 'Hoja de Prod.', description: 'Control operativo hoja por hoja',           icon: FileSpreadsheet, href: '/workflow/hoja-produccion',    rgb: '217 70 239'  },
  { label: 'Clientes',      description: 'Registro comercial y seguimiento',          icon: Users2,          href: '/workflow/clients',            rgb: '139 92 246'  },
  { label: 'Archivo OT',    description: 'Búsqueda y documentación de órdenes',      icon: FileSearch,      href: '/workflow/production',         rgb: '249 115 22'  },
  { label: 'Bodega',        description: 'Materiales, entradas y salidas',            icon: Warehouse,       href: '/workflow/warehouse',          rgb: '34 197 94'   },
  { label: 'WhatsApp',      description: 'Notificaciones en tiempo real a operarios', icon: MessageSquare,   href: '/workflow/whatsapp',           rgb: '16 185 129'  },
];

export default function WorkflowPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <ModuleLandingPage
        title="Workflow"
        subtitle="Gestión de órdenes, producción y operaciones del taller"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

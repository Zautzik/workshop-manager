/**
 * @fileoverview Analítica — Financial & KPI Hub
 * Merged module: Financial tracking + Manager KPIs & Reporting
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import {
  BarChart3, PieChart, DollarSign,
  LayoutDashboard, ClipboardCheck, GitMerge,
} from 'lucide-react';

const groups = [
  {
    label: 'Costos & Finanzas',
    color: 'from-green-500/10 to-emerald-500/5',
    border: 'border-green-500/20',
    heading: 'text-green-400',
    items: [
      { label: 'Costos',    description: 'Análisis de costos por OT, máquinas y centros',       icon: BarChart3,  href: '/financial/costos',   color: 'bg-green-500/10 text-green-400'   },
      { label: 'Márgenes',  description: 'Rentabilidad por OT y retorno de inversión en flota', icon: PieChart,   href: '/financial/margenes', color: 'bg-violet-500/10 text-violet-400' },
      { label: 'Finanzas',  description: 'Nómina, seguimiento financiero y pagos de órdenes',   icon: DollarSign, href: '/financial/nomina',   color: 'bg-amber-500/10 text-amber-400'   },
    ],
  },
  {
    label: 'KPIs & Reportes',
    color: 'from-indigo-500/10 to-cyan-500/5',
    border: 'border-indigo-500/20',
    heading: 'text-indigo-400',
    items: [
      { label: 'Dashboard',    description: 'Vista ejecutiva consolidada y KPIs del taller',          icon: LayoutDashboard, href: '/admin/overview',       color: 'bg-indigo-500/10 text-indigo-400' },
      { label: 'Análisis',     description: 'Rendimiento de personal, tendencias y auditoría de OTs', icon: ClipboardCheck,  href: '/manager/trabajadores', color: 'bg-cyan-500/10 text-cyan-400'     },
      { label: 'Trazabilidad', description: 'Ciclo completo de OTs y log de actividad del sistema',   icon: GitMerge,        href: '/manager/trazabilidad', color: 'bg-teal-500/10 text-teal-400'     },
    ],
  },
];

export default function FinancialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ModuleHexLanding
        title="Analítica"
        subtitle="Costos, finanzas, KPIs y reportes del taller"
        groups={groups}
      />
    </ProtectedRoute>
  );
}

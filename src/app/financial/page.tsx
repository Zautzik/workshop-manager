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

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  BarChart3, DollarSign, Wrench, Users,
  FileText, TrendingUp, PieChart, ClipboardCheck,
} from 'lucide-react';

const sections = [
  { label: 'Análisis de Costos',   description: 'Costos por OT y centros de costo',        icon: BarChart3,       href: '/financial/costos',       rgb: '34 197 94'   },
  { label: 'Seguimiento OT',       description: 'Seguimiento financiero por orden',          icon: FileText,        href: '/financial/ots',          rgb: '16 185 129'  },
  { label: 'Nómina',               description: 'Cálculo mensual de nómina',                 icon: Users,           href: '/financial/nomina',       rgb: '245 158 11'  },
  { label: 'Costos Máquinas',      description: 'Análisis de costo por equipo',              icon: Wrench,          href: '/financial/maquinas',     rgb: '249 115 22'  },
  { label: 'Inversión Equipos',    description: 'ROI y análisis de inversión',               icon: TrendingUp,      href: '/financial/inversion',    rgb: '6 182 212'   },
  { label: 'Márgenes por OT',      description: 'Análisis de margen mano de obra',           icon: PieChart,        href: '/financial/margenes',     rgb: '139 92 246'  },
  { label: 'KPIs & Reportes',      description: 'Analítica y rendimiento operativo',         icon: ClipboardCheck,  href: '/manager',                rgb: '99 102 241'  },
  { label: 'Costos OT (Detalle)',  description: 'Reporte detallado de costos reales',        icon: DollarSign,      href: '/financial/costos-ot',    rgb: '217 70 239'  },
];

export default function FinancialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ModuleLandingPage
        title="Finanzas & KPIs"
        subtitle="Control de costos, nómina, reportes y analítica gerencial"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

/**
 * @fileoverview Analítica — Financial & KPI Hub
 * Merged module: Financial tracking + Manager KPIs & Reporting
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  BarChart3, DollarSign, Wrench, Users,
  FileText, TrendingUp, PieChart, ClipboardCheck,
  Target, GitMerge, FileSearch, Activity,
  LayoutDashboard,
} from 'lucide-react';

const sections = [
  // — Financial rows —
  { label: 'Análisis de Costos',   description: 'Costos por OT y centros de costo',        icon: BarChart3,       href: '/financial/costos',       rgb: '34 197 94'   },
  { label: 'Costos OT (Detalle)',  description: 'Reporte detallado de costos reales',        icon: DollarSign,      href: '/financial/costos-ot',    rgb: '217 70 239'  },
  { label: 'Seguimiento OT',       description: 'Seguimiento financiero por orden',          icon: FileText,        href: '/financial/ots',          rgb: '16 185 129'  },
  { label: 'Nómina',               description: 'Cálculo mensual de nómina',                 icon: Users,           href: '/financial/nomina',       rgb: '245 158 11'  },
  { label: 'Costos Máquinas',      description: 'Análisis de costo por equipo',              icon: Wrench,          href: '/financial/maquinas',     rgb: '249 115 22'  },
  { label: 'Inversión Equipos',    description: 'ROI y análisis de inversión',               icon: TrendingUp,      href: '/financial/inversion',    rgb: '6 182 212'   },
  { label: 'Márgenes por OT',      description: 'Análisis de margen mano de obra',           icon: PieChart,        href: '/financial/margenes',     rgb: '139 92 246'  },
  // — Analytics & KPI rows —
  { label: 'KPIs Operativos',      description: 'Eficiencia, throughput y estado del taller',  icon: Target,          href: '/manager/kpis',           rgb: '99 102 241'  },
  { label: 'Trazabilidad',         description: 'Seguimiento completo del ciclo de OTs',        icon: GitMerge,        href: '/manager/trazabilidad',   rgb: '6 182 212'   },
  { label: 'Rendimiento Personal', description: 'Estadísticas y métricas de trabajadores',      icon: ClipboardCheck,  href: '/manager/trabajadores',   rgb: '245 158 11'  },
  { label: 'Tendencias',           description: 'Análisis de tendencias y proyecciones',        icon: BarChart3,       href: '/manager/tendencias',     rgb: '249 115 22'  },
  { label: 'Auditoría OT',         description: 'Historial detallado y estado de cada OT',     icon: FileSearch,      href: '/manager/auditoria',      rgb: '217 70 239'  },
  { label: 'Actividad',            description: 'Log de acciones y eventos del sistema',        icon: Activity,        href: '/manager/actividad',      rgb: '239 68 68'   },
  { label: 'Resumen Ejecutivo',    description: 'Vista de alto nivel para dirección',           icon: LayoutDashboard, href: '/admin/overview',         rgb: '139 92 246'  },
];

export default function FinancialPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ModuleLandingPage
        title="Analítica"
        subtitle="Costos, finanzas, KPIs y reportes del taller"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

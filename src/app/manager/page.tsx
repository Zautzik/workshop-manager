/**
 * @fileoverview Reportes & KPIs Landing Page
 * 
 * SYSTEM ROLE: Analytics & Insights Hub
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  BarChart3, GitMerge, Users, DollarSign,
  TrendingUp, Target, FileSearch, Activity,
} from 'lucide-react';

const sections = [
  { label: 'KPIs Operativos',      description: 'Eficiencia, throughput y estado del taller',  icon: Target,      href: '/manager/kpis',           rgb: '99 102 241'  },
  { label: 'Trazabilidad',         description: 'Seguimiento completo del ciclo de OTs',        icon: GitMerge,    href: '/manager/trazabilidad',   rgb: '6 182 212'   },
  { label: 'Rendimiento Personal', description: 'Estadísticas y métricas de trabajadores',      icon: Users,       href: '/manager/trabajadores',   rgb: '245 158 11'  },
  { label: 'Costos',               description: 'Reporte consolidado de costos operativos',     icon: DollarSign,  href: '/manager/costos',         rgb: '34 197 94'   },
  { label: 'Tendencias',           description: 'Análisis de tendencias y proyecciones',        icon: TrendingUp,  href: '/manager/tendencias',     rgb: '249 115 22'  },
  { label: 'Auditoría OT',         description: 'Historial detallado y estado de cada OT',     icon: FileSearch,  href: '/manager/auditoria',      rgb: '217 70 239'  },
  { label: 'Actividad',            description: 'Log de acciones y eventos del sistema',        icon: Activity,    href: '/manager/actividad',      rgb: '239 68 68'   },
  { label: 'Resumen Ejecutivo',    description: 'Vista de alto nivel para dirección',           icon: BarChart3,   href: '/admin/overview',         rgb: '139 92 246'  },
];

export default function ManagerPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ModuleLandingPage
        title="Reportes & KPIs"
        subtitle="Analítica operativa, trazabilidad y métricas de rendimiento"
        sections={sections}
      />

    </ProtectedRoute>
  );
}

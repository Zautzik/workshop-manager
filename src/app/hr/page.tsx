/**
 * @fileoverview HR Manager Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  Users, Wallet, BadgeCheck, CalendarDays,
  Gift, FileText, GraduationCap, Network,
} from 'lucide-react';

const sections = [
  { label: 'Directorio',      description: 'Perfiles, datos y estado de cada empleado', icon: Users,         href: '/hr/empleados',       rgb: '245 158 11'  },
  { label: 'Contratos',       description: 'Tipos de vinculación y fechas clave',        icon: FileText,      href: '/hr/contratos',       rgb: '249 115 22'  },
  { label: 'Nómina',          description: 'Historial de compensación por empleado',     icon: Wallet,        href: '/hr/nomina',          rgb: '34 197 94'   },
  { label: 'Licencias',       description: 'Permisos, ausencias y aprobaciones',         icon: CalendarDays,  href: '/hr/licencias',       rgb: '6 182 212'   },
  { label: 'Incentivos',      description: 'Bonos, metas y programas de incentivos',     icon: Gift,          href: '/hr/incentivos',      rgb: '217 70 239'  },
  { label: 'Certificaciones', description: 'Certificados vigentes por trabajador',       icon: BadgeCheck,    href: '/hr/certificaciones', rgb: '139 92 246'  },
  { label: 'Habilidades',     description: 'Árbol de habilidades y nivel de maestría',  icon: Network,       href: '/hr/habilidades',     rgb: '99 102 241'  },
  { label: 'Capacitación',    description: 'Cursos, base de conocimiento y formación',   icon: GraduationCap, href: '/admin/training',     rgb: '16 185 129'  },
];

export default function HrPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <ModuleLandingPage
        title="Personas"
        subtitle="Empleados, nómina, certificaciones y gestión del talento"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

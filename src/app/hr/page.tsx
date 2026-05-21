'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import {
  Users, UserCheck,
  Wallet, Network, GraduationCap,
} from 'lucide-react';

const groups = [
  {
    label: 'Personal',
    color: 'from-amber-500/10 to-orange-500/5',
    border: 'border-amber-500/20',
    heading: 'text-amber-400',
    items: [
      { label: 'Empleados',  description: 'Perfiles, contratos y datos de cada persona',  icon: Users,     href: '/hr/empleados', color: 'bg-amber-500/10 text-amber-400' },
      { label: 'Asistencia', description: 'Presencia, licencias y permisos del equipo',   icon: UserCheck, href: '/hr/licencias', color: 'bg-sky-500/10 text-sky-400'    },
    ],
  },
  {
    label: 'Compensación & Carrera',
    color: 'from-green-500/10 to-violet-500/5',
    border: 'border-green-500/20',
    heading: 'text-green-400',
    items: [
      { label: 'Retribución',  description: 'Nómina, bonos y programas de reconocimiento',      icon: Wallet,       href: '/hr/nomina',      color: 'bg-green-500/10 text-green-400'  },
      { label: 'Habilidades',  description: 'Skills, niveles de maestría y certificaciones',    icon: Network,      href: '/hr/habilidades', color: 'bg-violet-500/10 text-violet-400'},
      { label: 'Capacitación', description: 'Cursos, formación y planes de desarrollo',         icon: GraduationCap,href: '/admin/training', color: 'bg-teal-500/10 text-teal-400'   },
    ],
  },
];

export default function HrPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <ModuleHexLanding
        title="Personas"
        subtitle="Empleados, compensación y desarrollo del talento"
        groups={groups}
      />
    </ProtectedRoute>
  );
}

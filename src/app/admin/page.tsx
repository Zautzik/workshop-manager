/**
 * @fileoverview Admin Landing Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import {
  Users, Bell, Settings, Activity,
} from 'lucide-react';

const groups = [
  {
    label: 'Sistema',
    color: 'from-violet-500/10 to-slate-500/5',
    border: 'border-violet-500/20',
    heading: 'text-violet-400',
    items: [
      { label: 'Usuarios',      description: 'Cuentas, roles y permisos del sistema',           icon: Users,    href: '/admin/users',         color: 'bg-violet-500/10 text-violet-400' },
      { label: 'Notificaciones',description: 'Configuración de alertas y avisos',                icon: Bell,     href: '/admin/notifications', color: 'bg-amber-500/10 text-amber-400'   },
      { label: 'Config. & APIs',description: 'Parámetros globales, webhooks y conexiones externas', icon: Settings, href: '/admin/settings',      color: 'bg-orange-500/10 text-orange-400' },
      { label: 'Diagnósticos',  description: 'Salud del sistema, webhooks, seguridad y logs',    icon: Activity, href: '/admin/diagnostics',   color: 'bg-emerald-500/10 text-emerald-400' },
    ],
  },
];

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ModuleHexLanding
        title="Administración"
        subtitle="Usuarios, integraciones y configuración del sistema"
        groups={groups}
      />
    </ProtectedRoute>
  );
}

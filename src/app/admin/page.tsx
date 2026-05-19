/**
 * @fileoverview Admin Landing Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  Users, Bell,
  Plug, Settings, Package2,
} from 'lucide-react';

const sections = [
  { label: 'Usuarios',        description: 'Cuentas, roles y permisos del sistema',    icon: Users,    href: '/admin/users',         rgb: '139 92 246'  },
  { label: 'Abastecimiento',  description: 'Inventario, compras y bodega unificados',   icon: Package2, href: '/supply',              rgb: '6 182 212'   },
  { label: 'Notificaciones',  description: 'Configuración de alertas y avisos',         icon: Bell,     href: '/admin/notifications', rgb: '245 158 11'  },
  { label: 'Integraciones',   description: 'APIs externas y webhooks',                  icon: Plug,     href: '/admin/integrations',  rgb: '249 115 22'  },
  { label: 'Configuración',   description: 'Parámetros generales del sistema',          icon: Settings, href: '/admin/settings',      rgb: '239 68 68'   },
];

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ModuleLandingPage
        title="Administración"
        subtitle="Usuarios, abastecimiento, integraciones y configuración del sistema"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

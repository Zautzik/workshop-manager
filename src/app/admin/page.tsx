/**
 * @fileoverview Admin Landing Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import {
  Users, Package, ShoppingCart, Bell,
  Plug, LayoutDashboard, GraduationCap, Settings,
} from 'lucide-react';

const sections = [
  { label: 'Usuarios',       description: 'Cuentas, roles y permisos del sistema',    icon: Users,           href: '/admin/users',          rgb: '139 92 246'  },
  { label: 'Inventario',     description: 'Materiales, suministros y stock',           icon: Package,         href: '/admin/inventory',      rgb: '6 182 212'   },
  { label: 'Compras',        description: 'Órdenes de compra y proveedores',           icon: ShoppingCart,    href: '/admin/purchases',      rgb: '34 197 94'   },
  { label: 'Notificaciones', description: 'Configuración de alertas y avisos',         icon: Bell,            href: '/admin/notifications',  rgb: '245 158 11'  },
  { label: 'Integraciones',  description: 'APIs externas y webhooks',                  icon: Plug,            href: '/admin/integrations',   rgb: '249 115 22'  },
  { label: 'Capacitación',   description: 'Base de conocimiento y cursos internos',   icon: GraduationCap,   href: '/admin/training',       rgb: '99 102 241'  },
  { label: 'Vista Ejecutiva',description: 'Overview de alto nivel del sistema',        icon: LayoutDashboard, href: '/admin/overview',       rgb: '217 70 239'  },
  { label: 'Configuración',  description: 'Parámetros generales del sistema',          icon: Settings,        href: '/admin/settings',       rgb: '239 68 68'   },
];

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ModuleLandingPage
        title="Administración"
        subtitle="Usuarios, inventario, compras, integraciones y configuración del sistema"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleLandingPage from '@/components/ModuleLandingPage';
import { Package, ShoppingCart, Warehouse, ClipboardList, BarChart3, Truck } from 'lucide-react';

const sections = [
  { label: 'Inventario',        description: 'Stock actual, materiales y suministros',          icon: Package,       href: '/admin/inventory',    rgb: '6 182 212'  },
  { label: 'Compras',           description: 'Órdenes de compra, proveedores y cotizaciones',    icon: ShoppingCart,  href: '/admin/purchases',    rgb: '34 197 94'  },
  { label: 'Bodega',            description: 'Entradas, salidas y movimientos de almacén',       icon: Warehouse,     href: '/workflow/warehouse', rgb: '245 158 11' },
  { label: 'Órdenes Pendientes',description: 'Compras solicitadas sin recibir',                  icon: ClipboardList, href: '/admin/purchases',    rgb: '249 115 22' },
  { label: 'Proveedores',       description: 'Directorio y condiciones comerciales',             icon: Truck,         href: '/admin/purchases',    rgb: '139 92 246' },
  { label: 'Reportes',          description: 'Consumo por período y análisis de stock',          icon: BarChart3,     href: '/admin/inventory',    rgb: '217 70 239' },
];

export default function SupplyPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <ModuleLandingPage
        title="Abastecimiento"
        subtitle="Inventario, compras y bodega — todo en un solo flujo"
        sections={sections}
      />
    </ProtectedRoute>
  );
}

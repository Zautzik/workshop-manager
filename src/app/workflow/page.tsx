'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import ModuleHexLanding from '@/components/ModuleHexLanding';
import {
  ClipboardList, GanttChart, FileSpreadsheet,
  Factory, Clock,
  Users, MessageSquare, Package, ShoppingCart,
} from 'lucide-react';

const groups = [
  {
    label: 'Órdenes de Trabajo',
    color: 'from-sky-500/10 to-cyan-500/5',
    border: 'border-sky-500/20',
    heading: 'text-sky-400',
    items: [
      { label: 'Tablero',      description: 'Pipeline y estado en tiempo real de todas las OTs',  icon: ClipboardList,  href: '/workflow/kanban',          color: 'bg-cyan-500/10 text-cyan-400'      },
      { label: 'Cronograma',   description: 'Línea de tiempo, carga semanal y planificación',      icon: GanttChart,     href: '/workflow/gantt',           color: 'bg-violet-500/10 text-violet-400'  },
      { label: 'Producción',   description: 'Hojas de trabajo y archivo histórico de órdenes',    icon: FileSpreadsheet,href: '/workflow/hoja-produccion', color: 'bg-fuchsia-500/10 text-fuchsia-400'},
    ],
  },
  {
    label: 'Piso & Turnos',
    color: 'from-emerald-500/10 to-teal-500/5',
    border: 'border-emerald-500/20',
    heading: 'text-emerald-400',
    items: [
      { label: 'Planta',  description: 'Estaciones, asignación y pantalla del piso',  icon: Factory, href: '/workflow/planta',  color: 'bg-emerald-500/10 text-emerald-400' },
      { label: 'Turnos',  description: 'Configuración de turnos y horarios',           icon: Clock,   href: '/workflow/shifts',  color: 'bg-amber-500/10 text-amber-400'    },
    ],
  },
  {
    label: 'Clientes & Logística',
    color: 'from-violet-500/10 to-teal-500/5',
    border: 'border-violet-500/20',
    heading: 'text-violet-400',
    items: [
      { label: 'Clientes',  description: 'CRM, agenda de OTs y seguimiento comercial',          icon: Users,         href: '/workflow/clients',  color: 'bg-violet-500/10 text-violet-400' },
      { label: 'WhatsApp',  description: 'Captura de producción en campo en tiempo real',       icon: MessageSquare, href: '/workflow/whatsapp', color: 'bg-green-500/10 text-green-400'   },
      { label: 'Almacén',   description: 'Stock, materiales y movimientos de almacén',          icon: Package,       href: '/admin/inventory',   color: 'bg-teal-500/10 text-teal-400'    },
      { label: 'Compras',   description: 'Órdenes de compra, cotizaciones y proveedores',       icon: ShoppingCart,  href: '/admin/purchases',   color: 'bg-orange-500/10 text-orange-400' },
    ],
  },
];

export default function OperacionesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
      <ModuleHexLanding
        title="Operaciones"
        subtitle="Gestión de órdenes, producción y piso de taller"
        groups={groups}
      />
    </ProtectedRoute>
  );
}

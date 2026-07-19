/**
 * Single source of truth for application navigation.
 *
 * Both the sidebar (AppShell) and the module landing pages (ModuleHexLanding)
 * render from this config, which eliminates the drift that previously existed
 * between those two surfaces (different labels / targets / grouping for the same
 * module).
 *
 * NOTE: hrefs here are the *current* working URLs. The planned URL migration
 * (e.g. /operaciones/inventario -> /operaciones/...) is a later phase — change the
 * hrefs here (plus add redirects) when that happens and both surfaces update.
 */
import type { AppRole } from '@/types/app-role';
import {
  Home, Factory, Users, Wrench, TrendingUp, ShieldCheck,
  ClipboardList, GanttChart, FileSpreadsheet, Archive,
  Clock, Calendar, CalendarRange,
  Package, ShoppingCart, MessageSquare,
  UserCheck, Wallet, Network, GraduationCap, HardHat,
  Cpu, AlertCircle, BarChart3, PieChart, DollarSign,
  LayoutDashboard, ClipboardCheck, GitMerge,
  Bell, Settings, Activity, BadgeCheck, Receipt, FileCheck, Gauge,
  Award, FileText, Gift, Truck, Inbox,
} from 'lucide-react';

export interface NavLeaf {
  label: string;
  href: string;
  description: string;
  icon: React.ElementType;
  /** e.g. "bg-sky-500/10 text-sky-400" — drives the landing hex tint */
  color: string;
  roles?: AppRole[];
  external?: boolean;
}

export interface NavGroup {
  label: string;
  /** gradient classes, e.g. "from-sky-500/10 to-cyan-500/5" */
  color: string;
  /** border class, e.g. "border-sky-500/20" */
  border: string;
  /** heading text class, e.g. "text-sky-400" */
  heading: string;
  items: NavLeaf[];
}

/**
 * The IoE pillar a module belongs to (Internet of Everything: People · Process ·
 * Things · Data — bound by Connections). This is the business-credible framing of
 * the organism systems documented in docs/organism-vital-signs.md.
 */
export type OrganSystem = 'people' | 'process' | 'things' | 'data' | 'connections';

export interface SystemMeta {
  key: OrganSystem;
  label: string;
  /** short descriptor shown under the group label on the Living Home */
  organ: string;
}

/** Display groups for the Living Home, by IoE pillar. */
export const SYSTEMS: SystemMeta[] = [
  { key: 'people',      label: 'Personas',   organ: 'Talento y captura humana' },
  { key: 'process',     label: 'Procesos',   organ: 'Producción · calidad · ventas' },
  { key: 'things',      label: 'Equipos',    organ: 'Máquinas y mantenimiento' },
  { key: 'data',        label: 'Datos',      organ: 'Analítica y KPIs' },
  { key: 'connections', label: 'Conexiones', organ: 'Sistema e integraciones' },
];

export interface NavModule {
  key: string;
  /** Watercolor temperament for the module landing (WatercolorBackdrop tint). */
  tint?: 'neutral' | 'blue' | 'cyan' | 'rose' | 'amber' | 'orange' | 'green' | 'violet';
  label: string;
  href: string;
  subtitle: string;
  icon: React.ElementType;
  /** which body system this module is an organ of */
  system: OrganSystem;
  roles: AppRole[];
  /** sidebar styling */
  dot: string;
  activeBg: string;
  activeIcon: string;
  groups: NavGroup[];
}

export const HOME_ITEM = {
  key: 'home',
  label: 'Inicio',
  href: '/home',
  icon: Home,
  // vendedor is intentionally absent: /home is gated to ops roles, and a
  // vendedor's home is the Comercial module (see landingRouteForRole).
  roles: ['admin', 'manager', 'supervisor', 'hr_manager'] as AppRole[],
  dot: 'bg-slate-400',
  activeBg: 'bg-slate-200 dark:bg-slate-500/20',
  activeIcon: 'text-slate-600 dark:text-slate-300',
};

export const MODULES: NavModule[] = [
  {
    key: 'operaciones',
    tint: 'blue',
    label: 'Operaciones',
    href: '/operaciones',
    subtitle: 'Gestión de órdenes, producción y piso de taller',
    icon: Factory,
    system: 'process',
    roles: ['admin', 'supervisor', 'manager'],
    dot: 'bg-blue-500',
    activeBg: 'bg-blue-100 dark:bg-blue-500/20',
    activeIcon: 'text-blue-600 dark:text-blue-300',
    groups: [
      {
        label: 'Órdenes de Trabajo',
        color: 'from-sky-500/10 to-cyan-500/5', border: 'border-sky-500/20', heading: 'text-sky-400',
        items: [
          { label: 'Tablero',     href: '/operaciones/kanban',             description: 'Pipeline y estado en tiempo real de todas las OTs', icon: ClipboardList,   color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'En Proceso',  href: '/operaciones/ordenes-en-proceso', description: 'Tabla de planificación diaria: banderas ORD/PRO/VBP/PLN/PAP y proceso actual', icon: ClipboardCheck, color: 'bg-sky-500/10 text-sky-400' },
          { label: 'Hoja de Prod.',href: '/operaciones/hoja-produccion',   description: 'Hoja de trabajo de producción',                     icon: FileSpreadsheet, color: 'bg-fuchsia-500/10 text-fuchsia-400' },
        ],
      },
      {
        label: 'Piso & Planificación',
        color: 'from-emerald-500/10 to-teal-500/5', border: 'border-emerald-500/20', heading: 'text-emerald-400',
        items: [
          { label: 'Estación',      href: '/estacion',             description: 'Kiosko de fichaje por credencial QR (sin login)', icon: Clock,        color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Planta',        href: '/operaciones/planta',   description: 'Estaciones y asignación de operarios',           icon: Factory,       color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Planificación', href: '/operaciones/calendar', description: 'Cronograma de OTs, máquinas, calendario y plan semanal', icon: CalendarRange, color: 'bg-sky-500/10 text-sky-400' },
        ],
      },
      {
        label: 'Abastecimiento',
        color: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/20', heading: 'text-orange-400',
        items: [
          { label: 'Inventario', href: '/operaciones/inventario',  description: 'Stock, materiales y movimientos de almacén',   icon: Package,      color: 'bg-teal-500/10 text-teal-400' },
          { label: 'Compras',    href: '/operaciones/compras',     description: 'Órdenes de compra, cotizaciones y proveedores (incluye proveedores)', icon: ShoppingCart, color: 'bg-orange-500/10 text-orange-400' },
        ],
      },
      {
        label: 'Captura en Campo',
        color: 'from-green-500/10 to-emerald-500/5', border: 'border-green-500/20', heading: 'text-green-400',
        items: [
          { label: 'Capturas',  href: '/operaciones/captures', description: 'Bandeja unificada: producción y bodega vía WhatsApp / QR', icon: Inbox,         color: 'bg-green-500/10 text-green-400' },
          { label: 'WhatsApp', href: '/operaciones/whatsapp', description: 'Captura de producción en campo en tiempo real', icon: MessageSquare, color: 'bg-green-500/10 text-green-400' },
        ],
      },
    ],
  },
  {
    key: 'calidad',
    tint: 'rose',
    label: 'Calidad',
    href: '/calidad',
    subtitle: 'Trazabilidad, control de calidad y cumplimiento FSSC 22000',
    icon: BadgeCheck,
    system: 'process',
    roles: ['admin', 'manager', 'supervisor'],
    dot: 'bg-rose-500',
    activeBg: 'bg-rose-100 dark:bg-rose-500/20',
    activeIcon: 'text-rose-600 dark:text-rose-300',
    groups: [
      {
        label: 'Trazabilidad & Control',
        color: 'from-rose-500/10 to-pink-500/5', border: 'border-rose-500/20', heading: 'text-rose-400',
        items: [
          { label: 'Expediente',      href: '/calidad/expediente',   description: 'Trazabilidad documental FSSC 22000 por orden',        icon: FileCheck,   color: 'bg-rose-500/10 text-rose-400' },
          { label: 'Simulacro Retiro',href: '/calidad/recall',       description: 'Mock recall: del lote a las OTs y clientes afectados', icon: AlertCircle, color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Certificaciones', href: '/calidad/certificaciones', description: 'Registro FSSC de certificados de insumos y vencimientos', icon: BadgeCheck, color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Ciclo de OT',     href: '/calidad/trazabilidad', description: 'Lead time, cuellos de botella y recorrido de cada OT', icon: GitMerge,    color: 'bg-pink-500/10 text-pink-400' },
          { label: 'Retención',       href: '/calidad/retencion',    description: 'Conservación de registros FSSC 22000 (5 años)',        icon: Archive,     color: 'bg-violet-500/10 text-violet-400' },
        ],
      },
    ],
  },
  {
    key: 'comercial',
    tint: 'cyan',
    label: 'Comercial',
    href: '/comercial',
    subtitle: 'Clientes, ventas y facturación electrónica',
    icon: Receipt,
    system: 'process',
    roles: ['admin', 'manager', 'supervisor', 'vendedor'],
    dot: 'bg-cyan-500',
    activeBg: 'bg-cyan-100 dark:bg-cyan-500/20',
    activeIcon: 'text-cyan-600 dark:text-cyan-300',
    groups: [
      {
        label: 'Clientes & Ventas',
        color: 'from-cyan-500/10 to-sky-500/5', border: 'border-cyan-500/20', heading: 'text-cyan-400',
        items: [
          { label: 'Cotizaciones', href: '/comercial/cotizaciones', description: 'Visto Bueno con estimación de costos → OT', icon: FileSpreadsheet, color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Clientes',     href: '/comercial/clientes',     description: 'CRM, agenda de OTs y seguimiento comercial',   icon: Users,           color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Despachos',    href: '/comercial/despachos',    description: 'Guía de despacho → factura de venta (entregas parciales)', icon: Truck, color: 'bg-cyan-500/10 text-cyan-400', roles: ['admin', 'manager', 'supervisor'] },
          { label: 'Pipeline',     href: '/comercial/pipeline',     description: 'Embudo de ventas: cotización → OT (gerencia)', icon: GitMerge,        color: 'bg-cyan-500/10 text-cyan-400', roles: ['admin', 'manager'] },
        ],
      },
    ],
  },
  {
    key: 'personas',
    tint: 'amber',
    label: 'Personas',
    href: '/personas',
    subtitle: 'Empleados, compensación y desarrollo del talento',
    icon: Users,
    system: 'people',
    roles: ['admin', 'hr_manager', 'supervisor'],
    dot: 'bg-amber-500',
    activeBg: 'bg-amber-100 dark:bg-amber-500/20',
    activeIcon: 'text-amber-600 dark:text-amber-300',
    groups: [
      {
        label: 'Personal',
        color: 'from-amber-500/10 to-orange-500/5', border: 'border-amber-500/20', heading: 'text-amber-400',
        items: [
          { label: 'Empleados',  href: '/personas/empleados', description: 'Perfiles, contratos y datos de cada persona', icon: Users,     color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Asistencia', href: '/personas/licencias', description: 'Presencia, licencias y permisos del equipo',  icon: UserCheck, color: 'bg-sky-500/10 text-sky-400' },
          { label: 'Contratos',  href: '/personas/contratos', description: 'Contratos y documentos laborales',            icon: FileText,  color: 'bg-slate-500/10 text-slate-400' },
        ],
      },
      {
        label: 'Compensación & Carrera',
        color: 'from-green-500/10 to-violet-500/5', border: 'border-green-500/20', heading: 'text-green-400',
        items: [
          { label: 'Retribución',  href: '/personas/nomina',      description: 'Nómina, bonos y programas de reconocimiento',   icon: Wallet,        color: 'bg-green-500/10 text-green-400' },
          { label: 'Habilidades',    href: '/personas/habilidades',    description: 'Competencias, niveles de maestría y certificaciones', icon: Network,       color: 'bg-violet-500/10 text-violet-400' },
          { label: 'Capacitación',   href: '/personas/capacitacion',   description: 'Cursos, formación y planes de desarrollo',       icon: GraduationCap, color: 'bg-teal-500/10 text-teal-400' },
          { label: 'Certificaciones',href: '/personas/certificaciones',description: 'Certificaciones y acreditaciones del personal',  icon: Award,         color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Incentivos',     href: '/personas/incentivos',     description: 'Bonos, premios y reconocimientos',               icon: Gift,          color: 'bg-rose-500/10 text-rose-400' },
        ],
      },
    ],
  },
  {
    key: 'equipos',
    tint: 'orange',
    label: 'Equipos',
    href: '/equipos',
    subtitle: 'Mantenimiento, órdenes de trabajo y gestión de la flota',
    icon: Wrench,
    system: 'things',
    roles: ['admin', 'supervisor', 'manager'],
    dot: 'bg-orange-500',
    activeBg: 'bg-orange-100 dark:bg-orange-500/20',
    activeIcon: 'text-orange-600 dark:text-orange-300',
    groups: [
      {
        label: 'Flota & Mantenimiento',
        color: 'from-orange-500/10 to-rose-500/5', border: 'border-orange-500/20', heading: 'text-orange-400',
        items: [
          { label: 'Máquinas',      href: '/equipos/maquinas',  description: 'Registro, ficha técnica y estado de cada equipo',   icon: Cpu,           color: 'bg-orange-500/10 text-orange-400' },
          { label: 'Plan & Órdenes',href: '/equipos/ordenes',   description: 'OTs de mantenimiento, programa semanal y checklists', icon: ClipboardList, color: 'bg-sky-500/10 text-sky-400' },
          { label: 'Ejecución',     href: '/equipos/ejecucion', description: 'Registro de intervenciones y trabajos realizados',    icon: Wrench,        color: 'bg-fuchsia-500/10 text-fuchsia-400' },
        ],
      },
      {
        label: 'Análisis & Predictivo',
        color: 'from-violet-500/10 to-indigo-500/5', border: 'border-violet-500/20', heading: 'text-violet-400',
        items: [
          { label: 'Historial & KPIs',     href: '/equipos/historial', description: 'Registro histórico, MTBF, MTTR y métricas de flota', icon: BarChart3,   color: 'bg-indigo-500/10 text-indigo-400' },
          { label: 'Carga & Utilización',  href: '/equipos/carga',     description: 'Carga real por máquina desde la producción',          icon: Gauge,       color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Economía',             href: '/equipos/economia',  description: 'Costo operativo, depreciación y ROI por máquina',     icon: Wallet,      color: 'bg-teal-500/10 text-teal-400' },
          { label: 'Alertas & Predictivo', href: '/equipos/alertas',   description: 'Avisos activos y mantenimiento preventivo/predictivo', icon: AlertCircle, color: 'bg-amber-500/10 text-amber-400' },
        ],
      },
    ],
  },
  {
    key: 'analitica',
    tint: 'green',
    label: 'Analítica',
    href: '/analitica',
    subtitle: 'Costos, finanzas, KPIs y reportes del taller',
    icon: TrendingUp,
    system: 'data',
    roles: ['admin', 'manager'],
    dot: 'bg-green-500',
    activeBg: 'bg-green-100 dark:bg-green-500/20',
    activeIcon: 'text-green-600 dark:text-green-300',
    groups: [
      {
        label: 'Costos & Finanzas',
        color: 'from-green-500/10 to-emerald-500/5', border: 'border-green-500/20', heading: 'text-green-400',
        items: [
          { label: 'Centro de Costos', href: '/analitica/costos',   description: 'Catálogo de costos unitarios por material y centro', icon: BarChart3,  color: 'bg-green-500/10 text-green-400' },
          { label: 'Economía Equipos', href: '/analitica/maquinas', description: 'Resumen de costos e inversión de la flota',          icon: Cpu,        color: 'bg-teal-500/10 text-teal-400' },
          { label: 'Costo Laboral',    href: '/analitica/nomina',   description: 'Resumen de nómina del mes; detalle en Personas',     icon: DollarSign, color: 'bg-orange-500/10 text-orange-400' },
        ],
      },
      {
        label: 'Rentabilidad & KPIs',
        color: 'from-indigo-500/10 to-cyan-500/5', border: 'border-indigo-500/20', heading: 'text-indigo-400',
        items: [
          { label: 'Dashboard',    href: '/analitica/dashboard',    description: 'Vista ejecutiva consolidada y KPIs del taller',      icon: LayoutDashboard, color: 'bg-indigo-500/10 text-indigo-400' },
          { label: 'Rentabilidad', href: '/analitica/rentabilidad', description: 'Márgenes, costos estimados vs reales y seguimiento', icon: PieChart,        color: 'bg-violet-500/10 text-violet-400' },
          { label: 'Tendencias',   href: '/analitica/tendencias',   description: 'Tendencias y evolución de métricas del taller',      icon: TrendingUp,      color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Rendimiento',  href: '/analitica/rendimiento',  description: 'Estadísticas y métricas de trabajadores',            icon: ClipboardCheck,  color: 'bg-teal-500/10 text-teal-400' },
        ],
      },
    ],
  },
  {
    key: 'administracion',
    tint: 'violet',
    label: 'Administración',
    href: '/administracion',
    subtitle: 'Usuarios, integraciones y configuración del sistema',
    icon: ShieldCheck,
    system: 'connections',
    roles: ['admin'],
    dot: 'bg-violet-500',
    activeBg: 'bg-violet-100 dark:bg-violet-500/20',
    activeIcon: 'text-violet-600 dark:text-violet-300',
    groups: [
      {
        label: 'Sistema',
        color: 'from-violet-500/10 to-slate-500/5', border: 'border-violet-500/20', heading: 'text-violet-400',
        items: [
          { label: 'Usuarios',       href: '/administracion/users',         description: 'Cuentas, roles y permisos del sistema',              icon: Users,    color: 'bg-violet-500/10 text-violet-400' },
          { label: 'Notificaciones', href: '/administracion/notifications', description: 'Configuración de alertas y avisos',                   icon: Bell,     color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Config. & APIs', href: '/administracion/settings',      description: 'Parámetros globales, webhooks y conexiones externas', icon: Settings, color: 'bg-orange-500/10 text-orange-400' },
          { label: 'Integraciones',  href: '/administracion/integrations',  description: 'Conectores y servicios externos',                    icon: Network,  color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Diagnósticos',   href: '/administracion/diagnostics',   description: 'Salud del sistema, webhooks, seguridad y logs',       icon: Activity, color: 'bg-emerald-500/10 text-emerald-400' },
        ],
      },
    ],
  },
];

/**
 * The route a role should land on after login (and the "go home" fallback).
 * - technician → WhatsApp capture surface (their only touchpoint).
 * - vendedor   → Comercial (their only module; /home is gated to ops roles).
 * - everyone else → the Living Home.
 */
export function landingRouteForRole(role: AppRole | null | undefined): string {
  if (role === 'technician') return '/operaciones/whatsapp/operator';
  if (role === 'vendedor') return '/comercial';
  return '/home';
}

/** Look up a module by its base href (e.g. '/operaciones'). */
export function getModule(key: string): NavModule | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Filter a role to the modules it can see. */
export function modulesForRole(role: AppRole | null | undefined): NavModule[] {
  return MODULES.filter((m) => !role || m.roles.includes(role));
}

/** A nav leaf flattened out of its group, carrying its parent module context. */
export interface FlatNavLeaf extends NavLeaf {
  moduleKey: string;
  moduleLabel: string;
  moduleIcon: React.ElementType;
}

/**
 * Every section (leaf) across all modules, flattened — optionally filtered to
 * the ones a role can reach. Used by the home quick-links picker.
 */
export function getAllNavLeaves(role?: AppRole | null): FlatNavLeaf[] {
  const out: FlatNavLeaf[] = [];
  for (const m of MODULES) {
    if (role && !m.roles.includes(role)) continue;
    for (const g of m.groups) {
      for (const it of g.items) {
        if (role && it.roles && !it.roles.includes(role)) continue;
        out.push({ ...it, moduleKey: m.key, moduleLabel: m.label, moduleIcon: m.icon });
      }
    }
  }
  return out;
}

/** Resolve a single leaf by its href (ignores role). */
export function findNavLeaf(href: string): FlatNavLeaf | undefined {
  for (const m of MODULES) {
    for (const g of m.groups) {
      for (const it of g.items) {
        if (it.href === href) {
          return { ...it, moduleKey: m.key, moduleLabel: m.label, moduleIcon: m.icon };
        }
      }
    }
  }
  return undefined;
}

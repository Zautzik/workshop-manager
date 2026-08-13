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
  Home, Factory, Users, Wrench, TrendingUp, ShieldCheck, Target,
  ClipboardList, GanttChart, FileSpreadsheet, Archive, FileStack,
  Clock, Calendar, CalendarRange,
  Package, ShoppingCart, MessageSquare,
  UserCheck, Wallet, Network, GraduationCap, HardHat,
  Cpu, AlertCircle, BarChart3, PieChart, DollarSign,
  LayoutDashboard, ClipboardCheck, GitMerge,
  Bell, Settings, Activity, BadgeCheck, Receipt, FileCheck, Gauge,
  Award, FileText, Gift, Truck, Inbox, Cog, QrCode,
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
          // Pre-Prensa es una FASE del taller, no un informe: alguien trabaja
          // ahí completando fichas antes de que se pueda mandar la prueba.
          { label: 'Pre-Prensa',  href: '/operaciones/pre-prensa',         description: 'Completar la ficha antes de mandar la prueba al cliente', icon: FileStack,      color: 'bg-amber-500/10 text-amber-400' },
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
      // Two destinations, not two menus. Each one is an integrated workspace
      // that absorbed the pages that used to be scattered around it: the team
      // as it runs today, and the long game of growing it.
      {
        label: 'Operación',
        color: 'from-amber-500/10 to-orange-500/5', border: 'border-amber-500/20', heading: 'text-amber-400',
        items: [
          {
            label: 'Consola Operativa',
            href: '/personas/consola',
            description: 'El equipo hoy — fichas, contratos, retribución y asistencia en un solo lugar',
            icon: LayoutDashboard,
            color: 'bg-amber-500/10 text-amber-400',
          },
        ],
      },
      {
        label: 'Talento',
        color: 'from-violet-500/10 to-teal-500/5', border: 'border-violet-500/20', heading: 'text-violet-400',
        items: [
          {
            label: 'Desarrollo de Talento',
            href: '/personas/talento',
            description: 'Habilidades, capacitación, certificaciones e incentivos',
            icon: Network,
            color: 'bg-violet-500/10 text-violet-400',
          },
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
          { label: 'Mecánica & Repuestos', href: '/equipos/mecanica', description: 'Piezas por sistema, reposición y quién sabe operar cada máquina', icon: Cog, color: 'bg-rose-500/10 text-rose-400' },
          { label: 'Etiquetas QR',         href: '/equipos/etiquetas', description: 'Imprimir los QR para pegar en cada equipo y anotar lecturas', icon: QrCode, color: 'bg-slate-500/10 text-slate-400' },
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
    subtitle: 'Cuatro preguntas: si gano, cuánto cuesta, si el número es confiable y hacia dónde va',
    icon: TrendingUp,
    system: 'data',
    roles: ['admin', 'manager'],
    dot: 'bg-green-500',
    activeBg: 'bg-green-100 dark:bg-green-500/20',
    activeIcon: 'text-green-600 dark:text-green-300',
    // Agrupado por la pregunta del negocio, no por la tabla de origen. "Costos &
    // Finanzas" y "Rentabilidad & KPIs" describían de dónde sale el dato; quien
    // abre Analítica no llega buscando una familia de métricas, llega con una
    // pregunta. Las ocho pantallas son las mismas y sus rutas no cambian.
    groups: [
      {
        label: '¿Gano o pierdo?',
        color: 'from-green-500/10 to-emerald-500/5', border: 'border-green-500/20', heading: 'text-green-400',
        items: [
          { label: 'Rentabilidad', href: '/analitica/rentabilidad', description: 'Margen por trabajo: cotizado contra costo real', icon: PieChart,        color: 'bg-green-500/10 text-green-400' },
          { label: 'Resumen',      href: '/analitica/dashboard',    description: 'El estado del taller en una pantalla',           icon: LayoutDashboard, color: 'bg-emerald-500/10 text-emerald-400' },
        ],
      },
      {
        label: '¿Cuánto cuesta de verdad?',
        color: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/20', heading: 'text-orange-400',
        items: [
          { label: 'Materiales', href: '/analitica/costos',   description: 'Costos unitarios por material y centro de costo', icon: BarChart3,  color: 'bg-orange-500/10 text-orange-400' },
          { label: 'Mano de obra', href: '/analitica/nomina', description: 'Lo que cuesta la gente; el detalle vive en Personas', icon: DollarSign, color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Máquinas',   href: '/analitica/maquinas', description: 'Costo por hora e inversión de la flota',           icon: Cpu,        color: 'bg-teal-500/10 text-teal-400' },
        ],
      },
      {
        // Una sola pantalla, y aun así merece su propio encabezado: mientras el
        // motor no esté contrastado contra trabajos reales, los números de las
        // otras tres preguntas son estimaciones con cara de certeza.
        label: '¿Puedo confiar?',
        color: 'from-rose-500/10 to-red-500/5', border: 'border-rose-500/20', heading: 'text-rose-400',
        items: [
          { label: 'Calibración', href: '/analitica/calibracion', description: 'Contrasta el motor de costeo contra trabajos reales', icon: Target, color: 'bg-rose-500/10 text-rose-400' },
        ],
      },
      {
        label: '¿Hacia dónde vamos?',
        color: 'from-indigo-500/10 to-cyan-500/5', border: 'border-indigo-500/20', heading: 'text-indigo-400',
        items: [
          { label: 'Tendencias',  href: '/analitica/tendencias',  description: 'Cómo evolucionan las métricas del taller', icon: TrendingUp,     color: 'bg-cyan-500/10 text-cyan-400' },
          { label: 'Rendimiento', href: '/analitica/rendimiento', description: 'Productividad por persona y por equipo',   icon: ClipboardCheck, color: 'bg-indigo-500/10 text-indigo-400' },
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

/**
 * Where a pathname sits in the nav tree — module → section.
 *
 * Groups are deliberately not part of this. They are headings on the module
 * landing rather than routes, so a trail that included them would carry a step
 * nobody can navigate to.
 */
export interface NavTrail {
  module: NavModule;
  leaf?: NavLeaf;
  /** Path segments below the matched section, e.g. the id on a detail route. */
  rest: string[];
}

/**
 * Locate a pathname in the nav tree, for breadcrumbs.
 *
 * Matches the deepest section whose href prefixes the path, so detail routes
 * (`/equipos/lectura/abc123`) still resolve to their section and hand back the
 * leftover segments rather than falling back to the bare module. Routes that
 * have no nav entry at all still resolve their module, so a page that was never
 * added to the sidebar is missing a crumb rather than the whole trail.
 */
export function findNavTrail(pathname: string): NavTrail | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  // Not named `module`: Next reserves that identifier for the CommonJS global.
  const mod = MODULES.find((m) => path === m.href || path.startsWith(m.href + '/'));
  if (!mod) return undefined;

  let leaf: NavLeaf | undefined;
  for (const g of mod.groups) {
    for (const it of g.items) {
      if (path !== it.href && !path.startsWith(it.href + '/')) continue;
      // Longest match wins: two sections can share a prefix.
      if (!leaf || it.href.length > leaf.href.length) leaf = it;
    }
  }

  const matched = leaf?.href ?? mod.href;
  const rest = path.slice(matched.length).split('/').filter(Boolean);
  return { module: mod, leaf, rest };
}

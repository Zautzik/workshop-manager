'use client';

import { useRouter } from 'next/navigation';
import QuickLinks from '@/components/home/QuickLinks';
import VitalStrip from '@/components/home/VitalStrip';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useVitals, type FlowStatus } from '@/hooks/use-vitals';
import { useHomePrefs } from '@/hooks/use-home-prefs';
import { type OrganSystem } from '@/lib/navigation';
import {
  Factory,
  TrendingUp,
  Users,
  Wrench,
  ShieldCheck,
  BadgeCheck,
  Receipt,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  /** which body system this organ belongs to */
  system: OrganSystem;
  /** tailwind bg colour for the hex fill, e.g. "59 130 246" (rgb channels) */
  rgb: string;
  /** tailwind text colour class for dark mode */
  textCls: string;
  /** tailwind text colour class for light mode */
  lightTextCls: string;
  roles: string[];
}

const quickActions: QuickAction[] = [
  {
    label: 'Operaciones',
    description: 'Kanban, turnos, Gantt y OTs en tiempo real',
    icon: Factory,
    href: '/operaciones',
    system: 'process',
    rgb: '59 130 246',
    textCls: 'text-blue-100',
    lightTextCls: 'text-blue-900',
    roles: ['admin', 'supervisor', 'manager', 'technician'],
  },
  {
    label: 'Calidad',
    description: 'Trazabilidad, control de calidad y FSSC 22000',
    icon: BadgeCheck,
    href: '/calidad',
    system: 'process',
    rgb: '244 63 94',
    textCls: 'text-rose-100',
    lightTextCls: 'text-rose-900',
    roles: ['admin', 'manager', 'supervisor'],
  },
  {
    label: 'Comercial',
    description: 'Clientes, ventas y facturación electrónica',
    icon: Receipt,
    href: '/comercial',
    system: 'process',
    rgb: '6 182 212',
    textCls: 'text-cyan-100',
    lightTextCls: 'text-cyan-900',
    roles: ['admin', 'manager', 'supervisor'],
  },
  {
    label: 'Personas',
    description: 'Empleados, nómina, habilidades y contratos',
    icon: Users,
    href: '/personas',
    system: 'people',
    rgb: '245 158 11',
    textCls: 'text-amber-100',
    lightTextCls: 'text-amber-900',
    roles: ['admin', 'hr_manager', 'supervisor'],
  },
  {
    label: 'Equipos',
    description: 'Mantenimiento, predictivo, checklists y QR',
    icon: Wrench,
    href: '/equipos',
    system: 'things',
    rgb: '249 115 22',
    textCls: 'text-orange-100',
    lightTextCls: 'text-orange-900',
    roles: ['admin', 'technician', 'supervisor'],
  },
  {
    label: 'Analítica',
    description: 'Costos, KPIs, trazabilidad y reportes del taller',
    icon: TrendingUp,
    href: '/analitica',
    system: 'data',
    rgb: '34 197 94',
    textCls: 'text-green-100',
    lightTextCls: 'text-green-900',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Administración',
    description: 'Usuarios, integraciones y configuración',
    icon: ShieldCheck,
    href: '/administracion',
    system: 'connections',
    rgb: '139 92 246',
    textCls: 'text-violet-100',
    lightTextCls: 'text-violet-900',
    roles: ['admin'],
  },
];

// ─── Flat-top hex geometry ───────────────────────────────────────────────────
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const HEX_W = 180;                                    // px – bounding-box width
const HEX_H = Math.round(HEX_W * Math.sqrt(3) / 2); // 156 px – flat-top is wider than tall
const GAP = 12;                                       // px – breathing room between cells
const COL_STEP = Math.round(HEX_W * 0.75) + GAP;     // column center-to-center (interlocking)
const ROW_STEP = HEX_H + GAP;                         // row center-to-center within a column
const HOVER_SCALE = 1 + (2 * GAP) / HEX_W;           // ≈ 1.133 — growth fills the spread

const STATUS_DOT: Record<FlowStatus, string> = {
  flowing: 'rgb(16 185 129)',
  stagnant: 'rgb(245 158 11)',
  clotted: 'rgb(244 63 94)',
};

interface OrganVital {
  label: string;
  status: FlowStatus;
}

interface HexCellProps {
  action: QuickAction;
  vital: OrganVital | null;
  onClick: () => void;
  isDark: boolean;
}

function HexCell({ action, vital, onClick, isDark }: HexCellProps) {
  const Icon = action.icon;
  // Light mode: richer fills + dark text; dark mode: translucent fills + light text
  const fillOpacity   = isDark ? { c: 0.58, m: 0.24, e: 0.42 } : { c: 0.72, m: 0.42, e: 0.60 };
  const gleamOpacity  = isDark ? 0.18 : 0.28;
  const iconBrightness = isDark ? 1.7 : 0.65;
  const labelCls      = isDark ? action.textCls : action.lightTextCls;

  return (
    // drop-shadow wraps the clip-path correctly (unlike box-shadow)
    <div
      className="group cursor-pointer"
      style={{
        width: HEX_W,
        height: HEX_H,
        filter: `drop-shadow(0 6px 18px rgb(${action.rgb} / ${isDark ? 0.45 : 0.30}))`,
        flexShrink: 0,
        transition: 'filter 0.25s, transform 0.25s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.filter =
          `drop-shadow(0 10px 28px rgb(${action.rgb} / ${isDark ? 0.7 : 0.5}))`;
        (e.currentTarget as HTMLDivElement).style.transform = `scale(${HOVER_SCALE})`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.filter =
          `drop-shadow(0 6px 18px rgb(${action.rgb} / ${isDark ? 0.45 : 0.30}))`;
        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
      }}
      onClick={onClick}
    >
      {/* Hex face — bubbly radial gradient + clipped */}
      <div
        style={{
          width: '100%',
          height: '100%',
          clipPath: HEX_CLIP,
          background: `
            radial-gradient(
              ellipse 65% 60% at 38% 30%,
              rgb(${action.rgb} / ${fillOpacity.c}) 0%,
              rgb(${action.rgb} / ${fillOpacity.m}) 55%,
              rgb(${action.rgb} / ${fillOpacity.e}) 100%
            )
          `,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          position: 'relative',
          backdropFilter: 'blur(1px)',
        }}
      >
        {/* Highlight gleam – top-left bubble sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(
              ellipse 50% 40% at 30% 20%,
              rgba(255,255,255,${gleamOpacity}) 0%,
              transparent 70%
            )`,
            pointerEvents: 'none',
          }}
        />

        {/* Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: `rgb(${action.rgb} / ${isDark ? 0.25 : 0.18})`,
            border: `1.5px solid rgb(${action.rgb} / ${isDark ? 0.5 : 0.7})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            style={{
              width: 19,
              height: 19,
              color: `rgb(${action.rgb})`,
              filter: `brightness(${iconBrightness})`,
            }}
          />
        </div>

        {/* Label */}
        <span
          className={`font-bold text-center leading-tight ${labelCls}`}
          style={{
            fontSize: 15,
            maxWidth: '80%',
            lineHeight: 1.2,
            letterSpacing: '0.01em',
            textShadow: isDark ? '0 1px 4px rgba(0,0,0,0.55)' : '0 1px 2px rgba(255,255,255,0.65)',
          }}
        >
          {action.label}
        </span>

        {/* Organ pulse — live vital + flow-status dot */}
        {vital && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              background: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.5)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[vital.status] }} />
            <span className={labelCls} style={{ fontSize: 10, fontWeight: 600 }}>{vital.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomeDashboard() {
  const { user, role } = useAuth();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const { data: vitals } = useVitals();
  const { prefs } = useHomePrefs();

  const visibleActions = quickActions.filter(
    (action) => action.roles.includes(role || '')
  );

  // ── Interlaced honeycomb cluster (2-3-2 for up to 7 organs; flat-top hexes,
  //    columns overlap horizontally and alternate columns shift half a row so
  //    the cells interlock). Positions are normalized to a (0,0) bounding box. ──
  const colSizes = [2, 3, 2];
  const columns: QuickAction[][] = [];
  let colStart = 0;
  for (const size of colSizes) {
    if (colStart >= visibleActions.length) break;
    columns.push(visibleActions.slice(colStart, colStart + size));
    colStart += size;
  }
  const placed = columns.flatMap((col, ci) => {
    const yOffset = ci % 2 === 1 ? -ROW_STEP / 2 : 0; // middle column up → centered cluster
    return col.map((action, ri) => ({ action, x: ci * COL_STEP, y: yOffset + ri * ROW_STEP }));
  });
  const minY = placed.length ? Math.min(...placed.map((p) => p.y)) : 0;
  const honeyWidth = columns.length > 0 ? (columns.length - 1) * COL_STEP + HEX_W : 0;
  const honeyHeight = placed.length
    ? Math.max(...placed.map((p) => p.y - minY + HEX_H))
    : 0;

  // Live vital per organ (module), drawn from the vital-signs endpoint.
  const vitalFor = (href: string): OrganVital | null => {
    if (!vitals) return null;
    const v = vitals.vitals;
    switch (href) {
      case '/personas':      return { label: `Integridad ${v.circulacion.value}%`, status: v.circulacion.status };
      case '/operaciones':   return { label: `Validadas ${v.agni.value}%`, status: v.agni.status };
      case '/equipos':       return { label: `Uso ${v.carga.value}%`, status: v.carga.status };
      case '/analitica':     return { label: `Salud ${vitals.health.score}`, status: vitals.health.score >= 80 ? 'flowing' : vitals.health.score >= 60 ? 'stagnant' : 'clotted' };
      case '/administracion':return { label: v.toxinas.value ? `${v.toxinas.value} pendientes` : 'Al día', status: v.toxinas.status };
      default:               return null;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'es' ? 'Buenos días' : 'Good morning';
    if (hour < 18) return language === 'es' ? 'Buenas tardes' : 'Good afternoon';
    return language === 'es' ? 'Buenas noches' : 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-10 px-6 py-10 md:px-12">
      {/* Hero */}
      <div className="max-w-2xl text-center">
        <p className="text-sm font-medium text-muted-foreground mb-2">
          {getGreeting()}, <span className="text-foreground capitalize">{firstName}</span>
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
          {language === 'es' ? '¿Cómo puedo ayudarte hoy?' : 'How can I help you today?'}
        </h1>
      </div>

      {/* Vital signs — opt-in via the Personalizar dialog */}
      {prefs.showVitals && <VitalStrip />}

      {/* Interlaced organ honeycomb — tight cluster, absolutely positioned */}
      <div style={{ position: 'relative', width: honeyWidth, height: honeyHeight }}>
        {placed.map(({ action, x, y }) => (
          <div key={action.href} style={{ position: 'absolute', left: x, top: y - minY }}>
            <HexCell
              action={action}
              vital={vitalFor(action.href)}
              onClick={() => router.push(action.href)}
              isDark={isDark}
            />
          </div>
        ))}
      </div>

      {/* Personalized quick links */}
      <QuickLinks />
    </div>
  );
}

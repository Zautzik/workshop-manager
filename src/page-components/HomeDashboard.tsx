'use client';

import { useRouter } from 'next/navigation';
import QuickLinks from '@/components/home/QuickLinks';
import WatercolorBackdrop from '@/components/branding/WatercolorBackdrop';
import VitalStrip from '@/components/home/VitalStrip';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
    roles: ['admin', 'supervisor', 'manager'],
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
    roles: ['admin', 'manager', 'supervisor', 'vendedor'],
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
    roles: ['admin', 'supervisor', 'manager'],
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

interface HexCellProps {
  action: QuickAction;
  onClick: () => void;
  isDark: boolean;
}

function HexCell({ action, onClick, isDark }: HexCellProps) {
  const Icon = action.icon;
  // Light mode: richer fills + dark text; dark mode: translucent fills + light text
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
      {/* Glass hex: rim + frosted pane so the watercolor breathes through,
          with the module color as an inner tint instead of an opaque fill. */}
      <div
        style={{
          width: '100%',
          height: '100%',
          clipPath: HEX_CLIP,
          background: `rgb(${action.rgb} / 0.38)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          position: 'relative',
        }}
      >
        {/* faux-frost pane — no backdrop-filter (per-frame cost + square
            backdrop artifact under drop-shadow + clip-path); a denser
            translucent fill over the already-soft wash reads as glass. */}
        <div
          style={{
            position: 'absolute',
            inset: 2,
            clipPath: HEX_CLIP,
            background: 'linear-gradient(155deg, hsl(var(--card) / 0.68) 0%, hsl(var(--card) / 0.42) 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* module-color breath */}
        <div
          style={{
            position: 'absolute',
            inset: 2,
            clipPath: HEX_CLIP,
            background: `radial-gradient(ellipse 70% 62% at 38% 30%, rgb(${action.rgb} / ${isDark ? 0.34 : 0.30}) 0%, rgb(${action.rgb} / ${isDark ? 0.12 : 0.10}) 60%, transparent 85%)`,
            pointerEvents: 'none',
          }}
        />
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

        {/* Icon — position:relative lifts it above the frosted panes */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
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
            position: 'relative',
            zIndex: 1,
            fontSize: 15,
            maxWidth: '80%',
            lineHeight: 1.2,
            letterSpacing: '0.01em',
            textShadow: isDark ? '0 1px 4px rgba(0,0,0,0.55)' : '0 1px 2px rgba(255,255,255,0.65)',
          }}
        >
          {action.label}
        </span>

      </div>
    </div>
  );
}

export default function HomeDashboard() {
  const { user, role } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="relative min-h-full flex flex-col items-center justify-center gap-10 overflow-hidden px-6 py-10 md:px-12">
      <WatercolorBackdrop intensity="ambient" />
      {/* Quick links — compact pill, top-right */}
      <div className="absolute right-4 top-4 md:right-6 md:top-6 z-10">
        <QuickLinks />
      </div>

      {/* Hero */}
      <div className="max-w-2xl text-center">
        <p className="text-sm font-medium text-muted-foreground mb-2">
          {getGreeting()}, <span className="text-foreground capitalize">{firstName}</span>
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
          ¿Cómo puedo ayudarte hoy?
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
              onClick={() => router.push(action.href)}
              isDark={isDark}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

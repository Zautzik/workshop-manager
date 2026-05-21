'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Factory,
  BarChart3,
  TrendingUp,
  Users,
  Wrench,
  ShieldCheck,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
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
    href: '/workflow',
    rgb: '59 130 246',
    textCls: 'text-blue-100',
    lightTextCls: 'text-blue-900',
    roles: ['admin', 'supervisor', 'manager', 'technician'],
  },
  {
    label: 'Personas',
    description: 'Empleados, nómina, habilidades y contratos',
    icon: Users,
    href: '/hr',
    rgb: '245 158 11',
    textCls: 'text-amber-100',
    lightTextCls: 'text-amber-900',
    roles: ['admin', 'hr_manager', 'supervisor'],
  },
  {
    label: 'Equipos',
    description: 'Mantenimiento, predictivo, checklists y QR',
    icon: Wrench,
    href: '/maintenance',
    rgb: '249 115 22',
    textCls: 'text-orange-100',
    lightTextCls: 'text-orange-900',
    roles: ['admin', 'technician', 'supervisor'],
  },
  {
    label: 'Analítica',
    description: 'Costos, KPIs, trazabilidad y reportes del taller',
    icon: TrendingUp,
    href: '/financial',
    rgb: '34 197 94',
    textCls: 'text-green-100',
    lightTextCls: 'text-green-900',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Administración',
    description: 'Usuarios, integraciones y configuración',
    icon: ShieldCheck,
    href: '/admin',
    rgb: '139 92 246',
    textCls: 'text-violet-100',
    lightTextCls: 'text-violet-900',
    roles: ['admin'],
  },
];

// ─── Flat-top hex geometry ───────────────────────────────────────────────────
// Flat edges at top/bottom, points at left/right
// Width : Height = 2 : √3  →  Height = Width × √3/2 ≈ Width × 0.866
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const HEX_W = 180;                                    // px – bounding-box width
const HEX_H = Math.round(HEX_W * Math.sqrt(3) / 2); // 156 px – flat-top is wider than tall
const COL_STEP = Math.round(HEX_W * 0.75);           // 135 px – column center-to-center (interlocking)

interface HexCellProps {
  action: QuickAction;
  onClick: () => void;
  isDark: boolean;
}

function HexCell({ action, onClick, isDark }: HexCellProps) {
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
        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)';
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
          gap: 8,
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
            width: 44,
            height: 44,
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
              width: 20,
              height: 20,
              color: `rgb(${action.rgb})`,
              filter: `brightness(${iconBrightness})`,
            }}
          />
        </div>

        {/* Label */}
        <span
          className={`font-semibold text-center leading-tight ${labelCls}`}
          style={{ fontSize: 15, maxWidth: '70%', lineHeight: 1.3 }}
        >
          {action.label}
        </span>
      </div>
    </div>
  );
}

export default function HomeDashboard() {
  const { user, role } = useAuth();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === 'dark';
  const router = useRouter();

  const visibleActions = quickActions.filter(
    (action) => action.roles.includes(role || '')
  );

  // Group items into columns with 2-1-2 pattern for balanced honeycomb
  const colSizes = [2, 1, 2];
  const columns: QuickAction[][] = [];
  let colStart = 0;
  for (const size of colSizes) {
    if (colStart >= visibleActions.length) break;
    columns.push(visibleActions.slice(colStart, colStart + size));
    colStart += size;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'es' ? 'Buenos días' : 'Good morning';
    if (hour < 18) return language === 'es' ? 'Buenas tardes' : 'Good afternoon';
    return language === 'es' ? 'Buenas noches' : 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  // Total dimensions for the absolute-positioned honeycomb block
  const totalWidth = (columns.length - 1) * COL_STEP + HEX_W;
  const totalHeight = columns.length > 0
    ? Math.max(...columns.map((col, i) => (i % 2 === 1 ? Math.round(HEX_H / 2) : 0) + col.length * HEX_H))
    : 0;

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero section */}
      <div className="px-6 pt-12 pb-8 md:px-12 md:pt-16 md:pb-10">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {getGreeting()}, <span className="text-foreground capitalize">{firstName}</span>
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            {language === 'es' ? '¿Cómo puedo ayudarte hoy?' : 'How can I help you today?'}
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xl">
            {language === 'es'
              ? 'Selecciona un módulo para comenzar o navega usando el menú lateral.'
              : 'Select a module to get started or navigate using the side menu.'}
          </p>
        </div>
      </div>

      {/* Honeycomb grid */}
      <div className="flex-1 px-6 pb-16 md:px-12 flex items-start">
        <div
          style={{
            position: 'relative',
            width: totalWidth,
            height: totalHeight,
          }}
        >
          {columns.map((colItems, colIdx) => {
            // Odd columns shift down by HEX_H/2 for honeycomb interlocking
            const yOffset = colIdx % 2 === 1 ? Math.round(HEX_H / 2) : 0;
            const xBase = colIdx * COL_STEP;

            return colItems.map((action, rowIdx) => {
              const x = xBase;
              const y = yOffset + rowIdx * HEX_H;
              return (
                <div
                  key={action.href}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                  }}
                >
                  <HexCell
                    action={action}
                    onClick={() => router.push(action.href)}
                    isDark={isDark}
                  />
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

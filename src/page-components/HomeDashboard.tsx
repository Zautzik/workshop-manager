'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Factory,
  BarChart3,
  DollarSign,
  Users,
  Wrench,
  ClipboardList,
  Package,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  /** tailwind bg colour for the hex fill, e.g. "59 130 246" (rgb channels) */
  rgb: string;
  /** tailwind text colour class */
  textCls: string;
  roles: string[];
}

const quickActions: QuickAction[] = [
  {
    label: 'Flujo de Trabajo',
    description: 'Gestionar asignaciones, turnos y órdenes de trabajo',
    icon: Factory,
    href: '/workflow',
    rgb: '59 130 246',       // blue-500
    textCls: 'text-blue-200',
    roles: ['admin', 'supervisor', 'manager'],
  },
  {
    label: 'Producción',
    description: 'Órdenes de trabajo y seguimiento de producción',
    icon: ClipboardList,
    href: '/workflow/production',
    rgb: '16 185 129',       // emerald-500
    textCls: 'text-emerald-200',
    roles: ['admin', 'supervisor', 'manager'],
  },
  {
    label: 'KPIs & Reportes',
    description: 'Analítica, rendimiento y reportes gerenciales',
    icon: BarChart3,
    href: '/manager',
    rgb: '139 92 246',       // violet-500
    textCls: 'text-violet-200',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Finanzas',
    description: 'Control de costos, nómina y análisis financiero',
    icon: DollarSign,
    href: '/financial',
    rgb: '34 197 94',        // green-500
    textCls: 'text-green-200',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Recursos Humanos',
    description: 'Empleados, contratos, licencias y certificaciones',
    icon: Users,
    href: '/hr',
    rgb: '245 158 11',       // amber-500
    textCls: 'text-amber-200',
    roles: ['admin', 'hr_manager'],
  },
  {
    label: 'Máquinas',
    description: 'Registro de máquinas, mantenimiento y órdenes de trabajo',
    icon: Wrench,
    href: '/maintenance',
    rgb: '249 115 22',       // orange-500
    textCls: 'text-orange-200',
    roles: ['admin', 'technician', 'supervisor'],
  },
  {
    label: 'Inventario',
    description: 'Materiales, suministros y control de stock',
    icon: Package,
    href: '/admin/inventory',
    rgb: '6 182 212',        // cyan-500
    textCls: 'text-cyan-200',
    roles: ['admin'],
  },
];

// ─── Honeycomb layout ────────────────────────────────────────────────────────
// Pointy-top hexagon: clip-path polygon
// Width : Height ≈ 1 : 1.1547  (= 2/√3)
// Row-to-row vertical step  = height × 0.75   (rows overlap by ¼)
// Odd rows shift right by    width × 0.5
const HEX_W = 164;                            // px – bounding-box width
const HEX_H = Math.round(HEX_W * 1.1547);    // 189 px
const V_STEP = Math.round(HEX_H * 0.75);     // 142 px – row vertical step
const GAP = 4;                                // px – tiny gap between cells

// Build rows: [4, 3] fits 7 nicely; adapt to < 7 cards
function buildRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  let i = 0;
  let wide = true;
  while (i < items.length) {
    const size = wide ? 4 : 3;
    rows.push(items.slice(i, i + size));
    i += size;
    wide = !wide;
  }
  return rows;
}

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

interface HexCellProps {
  action: QuickAction;
  onClick: () => void;
}

function HexCell({ action, onClick }: HexCellProps) {
  const Icon = action.icon;
  return (
    // drop-shadow wraps the clip-path correctly (unlike box-shadow)
    <div
      className="group cursor-pointer"
      style={{
        width: HEX_W,
        height: HEX_H,
        filter: `drop-shadow(0 6px 18px rgb(${action.rgb} / 0.45))`,
        flexShrink: 0,
        transition: 'filter 0.25s, transform 0.25s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.filter =
          `drop-shadow(0 10px 28px rgb(${action.rgb} / 0.7))`;
        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.filter =
          `drop-shadow(0 6px 18px rgb(${action.rgb} / 0.45))`;
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
              rgb(${action.rgb} / 0.55) 0%,
              rgb(${action.rgb} / 0.22) 55%,
              rgb(${action.rgb} / 0.38) 100%
            )
          `,
          // subtle inner border via box-shadow inside clip is invisible —
          // so we layer a second, slightly-inset gradient ring via pseudo:
          // we'll fake it with an inset element instead
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
            clipPath: HEX_CLIP,
            background: `radial-gradient(
              ellipse 50% 40% at 30% 20%,
              rgba(255,255,255,0.18) 0%,
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
            background: `rgb(${action.rgb} / 0.25)`,
            border: `1.5px solid rgb(${action.rgb} / 0.5)`,
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
              filter: 'brightness(1.7)',
            }}
          />
        </div>

        {/* Label */}
        <span
          className={`font-semibold text-center leading-tight ${action.textCls}`}
          style={{ fontSize: 11.5, maxWidth: '72%', lineHeight: 1.3 }}
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
  const router = useRouter();

  const visibleActions = quickActions.filter(
    (action) => action.roles.includes(role || '')
  );

  const rows = buildRows(visibleActions);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'es' ? 'Buenos días' : 'Good morning';
    if (hour < 18) return language === 'es' ? 'Buenas tardes' : 'Good afternoon';
    return language === 'es' ? 'Buenas noches' : 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  // Total height of the honeycomb block
  const totalHeight = rows.length > 0
    ? HEX_H + (rows.length - 1) * V_STEP + GAP * (rows.length - 1)
    : 0;

  // Total width = widest row × (HEX_W + GAP)
  const maxRow = Math.max(...rows.map(r => r.length));
  const totalWidth = maxRow * (HEX_W + GAP) - GAP;

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
          {rows.map((rowItems, rowIdx) => {
            // Odd rows (0-indexed) shift right by half a hex width
            const isOffset = rowIdx % 2 === 1;
            const xShift = isOffset ? (HEX_W + GAP) / 2 : 0;
            const yBase = rowIdx * (V_STEP + GAP);

            return rowItems.map((action, colIdx) => {
              const x = xShift + colIdx * (HEX_W + GAP);
              const y = yBase;
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

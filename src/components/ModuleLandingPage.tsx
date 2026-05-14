'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/app-role';

export interface ModuleSection {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  rgb: string;
  roles?: AppRole[];
}

interface ModuleLandingPageProps {
  title: string;
  subtitle: string;
  sections: ModuleSection[];
  backHref?: string;
}

const HEX_W = 164;
const HEX_H = Math.round(HEX_W * 1.1547); // 189px
const V_STEP = Math.round(HEX_H * 0.75);  // 142px
const GAP = 4;
const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

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

function HexCell({ section, onClick, isDark }: { section: ModuleSection; onClick: () => void; isDark: boolean }) {
  const Icon = section.icon;
  const fillOpacity  = isDark ? { c: 0.58, m: 0.24, e: 0.42 } : { c: 0.72, m: 0.42, e: 0.60 };
  const gleamOpacity = isDark ? 0.18 : 0.28;
  const iconBrightness = isDark ? 1.7 : 0.65;
  const textCls = isDark ? 'text-white/90' : 'text-gray-800';

  return (
    <div
      className="group cursor-pointer"
      style={{
        width: HEX_W,
        height: HEX_H,
        filter: `drop-shadow(0 6px 18px rgb(${section.rgb} / ${isDark ? 0.45 : 0.30}))`,
        flexShrink: 0,
        transition: 'filter 0.25s, transform 0.25s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.filter = `drop-shadow(0 10px 28px rgb(${section.rgb} / ${isDark ? 0.7 : 0.5}))`;
        el.style.transform = 'scale(1.07)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.filter = `drop-shadow(0 6px 18px rgb(${section.rgb} / ${isDark ? 0.45 : 0.30}))`;
        el.style.transform = 'scale(1)';
      }}
      onClick={onClick}
    >
      <div
        style={{
          width: '100%', height: '100%',
          clipPath: HEX_CLIP,
          background: `radial-gradient(ellipse 65% 60% at 38% 30%,
            rgb(${section.rgb} / ${fillOpacity.c}) 0%,
            rgb(${section.rgb} / ${fillOpacity.m}) 55%,
            rgb(${section.rgb} / ${fillOpacity.e}) 100%)`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          position: 'relative', backdropFilter: 'blur(1px)',
        }}
      >
        {/* Gleam */}
        <div style={{
          position: 'absolute', inset: 0, clipPath: HEX_CLIP, pointerEvents: 'none',
          background: `radial-gradient(ellipse 50% 40% at 30% 20%, rgba(255,255,255,${gleamOpacity}) 0%, transparent 70%)`,
        }} />
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `rgb(${section.rgb} / ${isDark ? 0.25 : 0.18})`,
          border: `1.5px solid rgb(${section.rgb} / ${isDark ? 0.5 : 0.7})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 20, height: 20, color: `rgb(${section.rgb})`, filter: `brightness(${iconBrightness})` }} />
        </div>
        {/* Label */}
        <span className={`font-semibold text-center leading-tight ${textCls}`}
          style={{ fontSize: 11.5, maxWidth: '72%', lineHeight: 1.3 }}>
          {section.label}
        </span>
      </div>
    </div>
  );
}

export default function ModuleLandingPage({ title, subtitle, sections }: ModuleLandingPageProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { role } = useAuth();
  const isDark = theme === 'dark';

  const visible = sections.filter(s => !s.roles || s.roles.includes(role as AppRole));
  const rows = buildRows(visible);

  const maxRow = Math.max(...rows.map(r => r.length), 1);
  const totalWidth  = maxRow * (HEX_W + GAP) - GAP;
  const totalHeight = rows.length > 0 ? HEX_H + (rows.length - 1) * (V_STEP + GAP) : 0;

  return (
    <div className="min-h-full flex flex-col">
      <div className="px-6 pt-12 pb-8 md:px-12 md:pt-16 md:pb-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">{title}</h1>
          <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex-1 px-6 pb-16 md:px-12 flex items-start">
        <div style={{ position: 'relative', width: totalWidth, height: totalHeight }}>
          {rows.map((rowItems, rowIdx) => {
            const isOffset = rowIdx % 2 === 1;
            const xShift = isOffset ? (HEX_W + GAP) / 2 : 0;
            const yBase  = rowIdx * (V_STEP + GAP);
            return rowItems.map((section, colIdx) => (
              <div key={section.href} style={{ position: 'absolute', left: xShift + colIdx * (HEX_W + GAP), top: yBase }}>
                <HexCell section={section} onClick={() => router.push(section.href)} isDark={isDark} />
              </div>
            ));
          })}
        </div>
      </div>
    </div>
  );
}

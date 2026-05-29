'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';

// ─── Hex geometry (flat-top) ───────────────────────────────────────────────────
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const HEX_W = 172;
const HEX_H = Math.round(HEX_W * Math.sqrt(3) / 2); // ≈ 149 px
const COL_X_STEP = Math.round(HEX_W * 0.75);         // ≈ 129 px — column overlap

// ─── Tailwind color name → RGB channels ──────────────────────────────────────
const RGB: Record<string, string> = {
  sky:     '14 165 233',  cyan:    '6 182 212',   violet:  '139 92 246',
  emerald: '16 185 129',  amber:   '245 158 11',  orange:  '249 115 22',
  green:   '34 197 94',   indigo:  '99 102 241',  fuchsia: '217 70 239',
  teal:    '20 184 166',  purple:  '168 85 247',  blue:    '59 130 246',
  rose:    '244 63 94',   pink:    '236 72 153',  red:     '239 68 68',
  slate:   '148 163 184', zinc:    '161 161 170',
};

/** Extract the first Tailwind color name from a class string like "text-sky-400" */
function getRgb(colorCls: string): string {
  const name = colorCls.match(/text-(\w+)-/)?.[1] ?? colorCls.match(/bg-(\w+)-/)?.[1] ?? '';
  return RGB[name] ?? '148 163 184';
}

// ─── Honeycomb layout helpers ─────────────────────────────────────────────────
function hexPos(idx: number) {
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  return {
    x: col * COL_X_STEP,
    y: row * HEX_H + (col === 1 ? Math.round(HEX_H / 2) : 0),
  };
}

function honeyContainerSize(n: number) {
  let maxX = 0, maxY = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = hexPos(i);
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { w: maxX + HEX_W, h: maxY + HEX_H };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HexLandingItem {
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ElementType<any>;
  href: string;
  /** e.g. "bg-sky-500/10 text-sky-400" */
  color: string;
  external?: boolean;
}

export interface HexLandingGroup {
  label: string;
  /** Tailwind gradient classes — kept for backward compat */
  color: string;
  /** Tailwind border class — kept for backward compat */
  border: string;
  /** Tailwind text class for the tab heading, e.g. "text-sky-400" */
  heading: string;
  items: HexLandingItem[];
}

interface Props {
  title: string;
  subtitle: string;
  groups: HexLandingGroup[];
}

// ─── Single hex tile ──────────────────────────────────────────────────────────
function HexTile({ item }: { item: HexLandingItem }) {
  const Icon = item.icon;
  const r = getRgb(item.color);

  return (
    <Link href={item.href} className="outline-none select-none" style={{ display: 'block' }}>
      <div
        style={{
          filter: `drop-shadow(0 4px 10px rgb(${r} / 0.32))`,
          transition: 'filter 0.22s ease, transform 0.22s ease',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.filter = `drop-shadow(0 8px 28px rgb(${r} / 0.72))`;
          el.style.transform = 'scale(1.09) translateY(-4px)';
          el.style.zIndex = '10';
          el.style.position = 'relative';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.filter = `drop-shadow(0 4px 10px rgb(${r} / 0.32))`;
          el.style.transform = '';
          el.style.zIndex = '';
          el.style.position = '';
        }}
      >
        {/* Hex face */}
        <div
          style={{
            width: HEX_W,
            height: HEX_H,
            clipPath: HEX_CLIP,
            background: `radial-gradient(ellipse 70% 65% at 40% 35%, rgb(${r} / 0.52) 0%, rgb(${r} / 0.28) 55%, rgb(${r} / 0.14) 100%)`,
            position: 'relative',
          }}
        >
          {/* Gleam — top-left shine */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse 58% 48% at 30% 22%, rgba(255,255,255,0.20) 0%, transparent 68%)',
              pointerEvents: 'none',
            }}
          />
          {/* Rim highlight */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse 90% 80% at 50% 50%, transparent 60%, rgb(${r} / 0.12) 100%)`,
              pointerEvents: 'none',
            }}
          />

          {/* Content */}
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 6,
            }}
          >
            {/* Icon circle */}
            <div
              style={{
                borderRadius: '50%',
                width: 44, height: 44,
                background: `rgb(${r} / 0.24)`,
                border: `1.5px solid rgb(${r} / 0.62)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 2px 10px rgb(${r} / 0.30)`,
              }}
            >
              <Icon style={{ width: 21, height: 21, color: `rgb(${r})`, filter: 'brightness(1.65)' }} />
            </div>

            {/* Label */}
            <span
              className="text-foreground font-bold text-center"
              style={{ fontSize: 13, lineHeight: 1.2, maxWidth: 108, letterSpacing: '-0.01em' }}
            >
              {item.label}
              {item.external && (
                <ExternalLink style={{ width: 9, height: 9, opacity: 0.55, marginLeft: 2, display: 'inline', verticalAlign: 'middle' }} />
              )}
            </span>

            {/* Description */}
            <p
              className="text-foreground/55"
              style={{
                fontSize: 10,
                textAlign: 'center',
                lineHeight: 1.35,
                maxWidth: 102,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.description}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ModuleHexLanding({ title, subtitle, groups }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const group = groups[activeIdx] ?? groups[0];
  const n = group.items.length;
  const { w, h } = honeyContainerSize(n);

  return (
    <div className="px-6 pt-6 pb-10">
      {/* Page header */}
      <div className="mb-7">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 group"
        >
          <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          Inicio
        </Link>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {/* Tab buttons — one per group */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {groups.map((g, i) => {
            const r = getRgb(g.heading);
            const isActive = i === activeIdx;
            return (
              <button
                key={g.label}
                onClick={() => setActiveIdx(i)}
                className="relative px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200"
                style={{
                  background: isActive ? `rgb(${r} / 0.16)` : 'transparent',
                  border: `1.5px solid rgb(${r} / ${isActive ? 0.55 : 0.22})`,
                  color: isActive ? `rgb(${r})` : `rgb(${r} / 0.50)`,
                  boxShadow: isActive
                    ? `0 0 18px rgb(${r} / 0.22), inset 0 1px 0 rgba(255,255,255,0.06)`
                    : 'none',
                }}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgb(${r} / 0.10) 0%, transparent 70%)`,
                    }}
                  />
                )}
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Group label when only one group */}
      {groups.length === 1 && (
        <p
          className="text-[11px] font-bold uppercase tracking-widest mb-6"
          style={{ color: `rgb(${getRgb(group.heading)} / 0.70)` }}
        >
          {group.label}
        </p>
      )}

      {/* Honeycomb hex grid — absolute positioned for true honeycomb layout */}
      <div style={{ position: 'relative', width: w, height: h }}>
        {group.items.map((item, i) => {
          const { x, y } = hexPos(i);
          return (
            <div
              key={item.href + item.label}
              style={{ position: 'absolute', left: x, top: y }}
            >
              <HexTile item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

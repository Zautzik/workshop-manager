'use client';

import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';

// ─── Hex geometry (flat-top: flat edges at top/bottom, points at left/right) ──
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const HEX_W = 132;
const HEX_H = Math.round(HEX_W * Math.sqrt(3) / 2); // 114 px — flat-top is wider than tall
const GAP = 6;

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
  const name = colorCls.match(/text-(\w+)-/)?.[1] ?? '';
  return RGB[name] ?? '148 163 184';
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
  /** Tailwind gradient classes, e.g. "from-sky-500/10 to-cyan-500/5" */
  color: string;
  /** Tailwind border class, e.g. "border-sky-500/20" */
  border: string;
  /** Tailwind text class for the heading, e.g. "text-sky-400" */
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
          filter: `drop-shadow(0 3px 8px rgb(${r} / 0.26))`,
          transition: 'filter 0.2s ease, transform 0.2s ease',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.filter = `drop-shadow(0 5px 16px rgb(${r} / 0.6))`;
          el.style.transform = 'scale(1.06)';
          el.style.zIndex = '10';
          el.style.position = 'relative';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.filter = `drop-shadow(0 3px 8px rgb(${r} / 0.26))`;
          el.style.transform = 'scale(1)';
          el.style.zIndex = '';
          el.style.position = '';
        }}
      >
        <div
          style={{
            width: HEX_W,
            height: HEX_H,
            clipPath: HEX_CLIP,
            background: `rgb(${r} / 0.16)`,
            position: 'relative',
          }}
        >
          {/* Gleam — subtle top-left shine */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse 60% 50% at 35% 28%, rgba(255,255,255,0.14) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '0 18px',
            }}
          >
            <div
              style={{
                borderRadius: '50%',
                padding: 6,
                background: `rgb(${r} / 0.26)`,
                border: `1.5px solid rgb(${r} / 0.5)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon style={{ width: 17, height: 17, color: `rgb(${r})`, filter: 'brightness(1.5)' }} />
            </div>

            <span
              className="text-foreground"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textAlign: 'center',
                lineHeight: 1.15,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              {item.label}
              {item.external && <ExternalLink style={{ width: 8, height: 8, opacity: 0.6, flexShrink: 0 }} />}
            </span>

            <p
              className="text-muted-foreground"
              style={{
                fontSize: 8.5,
                textAlign: 'center',
                lineHeight: 1.25,
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

// ─── Main component — one honeycomb row per group, whole module at a glance ────
export default function ModuleHexLanding({ title, subtitle, groups }: Props) {
  return (
    <div className="px-6 pt-5 pb-8 md:px-10">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ChevronLeft className="w-3 h-3" />
          Inicio
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Group bands */}
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${group.heading}`}>
              {group.label}
            </h2>
            <div className="flex flex-wrap" style={{ gap: GAP }}>
              {group.items.map((item) => (
                <HexTile key={item.href + item.label} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ChevronLeft, ExternalLink, Hexagon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Hex geometry (flat-top) ──────────────────────────────────────────────────
// These constants are tuned together against a vertical budget: the tallest
// layout (a 4-group module = two stacked rows of 4-hex clusters) must still fit
// "at a glance" on a standard desktop viewport. Enlarging HEX_W trades that
// headroom away fast — bump Rx/Ry and shrink HUB in step, and re-check the
// 4-group module before committing.
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const HEX_W = 128;
const HEX_H = Math.round(HEX_W * Math.sqrt(3) / 2); // ~111
const COL_STEP = Math.round(HEX_W * 0.9);           // columns kiss, not collide → tiles stay legible
const ROW_STEP = HEX_H + 3;                          // vertical pitch in a column
const HUB = 64;                                      // small decorative module hub

// ─── Tailwind color name → RGB channels ──────────────────────────────────────
const RGB: Record<string, string> = {
  sky:     '14 165 233',  cyan:    '6 182 212',   violet:  '139 92 246',
  emerald: '16 185 129',  amber:   '245 158 11',  orange:  '249 115 22',
  green:   '34 197 94',   indigo:  '99 102 241',  fuchsia: '217 70 239',
  teal:    '20 184 166',  purple:  '168 85 247',  blue:    '59 130 246',
  rose:    '244 63 94',   pink:    '236 72 153',  red:     '239 68 68',
  slate:   '148 163 184', zinc:    '161 161 170',
};
function getRgb(colorCls: string): string {
  const name = colorCls.match(/text-(\w+)-/)?.[1] ?? '';
  return RGB[name] ?? '148 163 184';
}

export interface HexLandingItem {
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ElementType<any>;
  href: string;
  color: string;
  external?: boolean;
}
export interface HexLandingGroup {
  label: string;
  color: string;
  border: string;
  heading: string;
  items: HexLandingItem[];
}
interface Props {
  title: string;
  subtitle: string;
  groups: HexLandingGroup[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hubIcon?: React.ElementType<any>;
}

// ── Positions of a group's hexes (centered on its own origin) — 2-col honeycomb ──
function blobPositions(n: number): { x: number; y: number }[] {
  if (n <= 1) return [{ x: 0, y: 0 }];
  const left = Math.ceil(n / 2);
  const right = n - left;
  const raw: { x: number; y: number }[] = [];
  for (let j = 0; j < left; j++) raw.push({ x: -COL_STEP / 2, y: j * ROW_STEP });
  for (let j = 0; j < right; j++) raw.push({ x: COL_STEP / 2, y: j * ROW_STEP + ROW_STEP / 2 });
  const ys = raw.map((p) => p.y);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return raw.map((p) => ({ x: p.x, y: p.y - cy }));
}

// ── Where each group sits relative to the hub at (0,0) — biased horizontally ──
function groupCenters(g: number): { x: number; y: number }[] {
  const Rx = 218, Ry = 178;
  switch (g) {
    case 1: return [{ x: 0, y: 0 }];
    case 2: return [{ x: -Rx, y: 0 }, { x: Rx, y: 0 }];
    case 3: return [{ x: 0, y: -Ry * 1.2 }, { x: -Rx * 0.96, y: Ry * 0.82 }, { x: Rx * 0.96, y: Ry * 0.82 }];
    case 4: return [
      { x: -Rx * 0.86, y: -Ry }, { x: Rx * 0.86, y: -Ry },
      { x: -Rx * 0.86, y: Ry }, { x: Rx * 0.86, y: Ry },
    ];
    default: // 5+ — even polar ring
      return Array.from({ length: g }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / g;
        return { x: Math.cos(a) * Rx, y: Math.sin(a) * Ry };
      });
  }
}

// Vertical span of a group's hex blob (centered) — used to align rows by top edge.
function blobSpan(n: number): number {
  const ys = blobPositions(n).map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
}

// ─── Single hex tile ──────────────────────────────────────────────────────────
function HexTile({ item, size }: { item: HexLandingItem; size: number }) {
  const Icon = item.icon;
  const r = getRgb(item.color);
  const h = Math.round(size * Math.sqrt(3) / 2);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.href} className="outline-none select-none" style={{ display: 'block' }}>
          <div
            style={{ filter: `drop-shadow(0 3px 8px rgb(${r} / 0.28))`, transition: 'filter 0.2s, transform 0.2s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.filter = `drop-shadow(0 6px 18px rgb(${r} / 0.6))`; el.style.transform = 'scale(1.07)'; el.style.zIndex = '20'; el.style.position = 'relative'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.filter = `drop-shadow(0 3px 8px rgb(${r} / 0.28))`; el.style.transform = 'scale(1)'; el.style.zIndex = ''; el.style.position = ''; }}
          >
            <div style={{ width: size, height: h, clipPath: HEX_CLIP, background: `rgb(${r} / 0.18)`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 35% 28%, rgba(255,255,255,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
              {/* Icon sits in the upper quarter; label is centred on the hex's
                  widest band (mid-line) so even long single words clear the
                  slanted sides. */}
              <div style={{ position: 'absolute', left: '50%', top: '24%', transform: 'translate(-50%, -50%)', borderRadius: '50%', padding: 6, background: `rgb(${r} / 0.26)`, border: `1.5px solid rgb(${r} / 0.5)`, display: 'flex' }}>
                <Icon style={{ width: 18, height: 18, color: `rgb(${r})`, filter: 'brightness(1.5)' }} />
              </div>
              <span className="text-foreground" style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -50%)', width: '84%', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', textAlign: 'center', lineHeight: 1.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                {item.label}
                {item.external && <ExternalLink style={{ width: 11, height: 11, opacity: 0.6, marginLeft: 3, display: 'inline' }} />}
              </span>
            </div>
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-center text-base">{item.description}</TooltipContent>
    </Tooltip>
  );
}

// ─── Main — hub & spokes radial ───────────────────────────────────────────────
export default function ModuleHexLanding({ title, subtitle, groups, hubIcon }: Props) {
  const g = groups.length;
  const centers = groupCenters(g);
  const hasHub = g >= 2;
  const HubIcon = hubIcon;

  // Align clusters that share a row by their top edge, so the section labels
  // line up neatly regardless of how many hexes each cluster holds. The tallest
  // cluster in a row stays put; shorter ones shift up so all tops match.
  const halfH = groups.map((gr) => blobSpan(gr.items.length) / 2);
  const rows = new Map<number, number[]>();
  centers.forEach((c, i) => {
    const key = Math.round(c.y);
    (rows.get(key) ?? rows.set(key, []).get(key)!).push(i);
  });
  const aligned = centers.map((c) => ({ ...c }));
  rows.forEach((idxs) => {
    const maxHalf = Math.max(...idxs.map((i) => halfH[i]));
    idxs.forEach((i) => { aligned[i].y = centers[i].y - maxHalf + halfH[i]; });
  });

  // Place every section hex (coords = hex centre, origin = hub centre).
  const placed = groups.flatMap((group, gi) => {
    const c = aligned[gi] ?? { x: 0, y: 0 };
    return blobPositions(group.items.length).map((p, idx) => ({
      item: group.items[idx], gi, x: c.x + p.x, y: c.y + p.y,
    }));
  });

  // Group labels sit just above each cluster; same-row clusters now share a top.
  const labels = groups.map((group, gi) => {
    const c = aligned[gi] ?? { x: 0, y: 0 };
    const tops = placed.filter((p) => p.gi === gi).map((p) => p.y);
    return { group, x: c.x, y: (tops.length ? Math.min(...tops) : c.y) - HEX_H / 2 - 32 };
  });

  // Bounding box → normalize to a (0,0) container.
  const xs = placed.map((p) => p.x);
  const ys = placed.map((p) => p.y);
  const minX = Math.min(hasHub ? -HUB / 2 : Infinity, ...xs.map((x) => x - HEX_W / 2));
  const maxX = Math.max(hasHub ? HUB / 2 : -Infinity, ...xs.map((x) => x + HEX_W / 2));
  const minY = Math.min(hasHub ? -HUB / 2 : Infinity, ...ys.map((y) => y - HEX_H / 2), ...labels.map((l) => l.y));
  const maxY = Math.max(hasHub ? HUB / 2 : -Infinity, ...ys.map((y) => y + HEX_H / 2));
  const W = maxX - minX;
  const H = maxY - minY;
  const ox = -minX;
  const oy = -minY;
  const hexH = HEX_H;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-full flex flex-col px-6 pt-5 pb-6 md:px-10">
        {/* Header */}
        <div className="shrink-0">
          <Link href="/home" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Inicio
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground mt-1">{title}</h1>
          <p className="text-base text-muted-foreground mt-0.5">{subtitle}</p>
        </div>

        {/* Radial canvas */}
        <div className="flex-1 flex items-center justify-center">
          <div style={{ position: 'relative', width: W, height: H }}>
            {/* Decorative hub */}
            {hasHub && (
              <div style={{ position: 'absolute', left: ox - HUB / 2, top: oy - HUB / 2, width: HUB, height: Math.round(HUB * Math.sqrt(3) / 2) }}>
                <div style={{ width: '100%', height: '100%', clipPath: HEX_CLIP, background: 'hsl(var(--primary) / 0.10)', border: '1px solid hsl(var(--primary) / 0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {HubIcon && <HubIcon className="text-primary/60" style={{ width: 26, height: 26 }} />}
                </div>
              </div>
            )}

            {/* Group labels */}
            {labels.map(({ group, x, y }) => (
              <div
                key={group.label}
                style={{ position: 'absolute', left: x + ox, top: y + oy, transform: 'translateX(-50%)', whiteSpace: 'nowrap', zIndex: 10 }}
              >
                <span className="inline-flex items-center gap-2 text-base font-semibold uppercase tracking-[0.12em] text-foreground/80">
                  <Hexagon className={group.heading} fill="currentColor" fillOpacity={0.25} style={{ width: 13, height: 13 }} />
                  {group.label}
                </span>
              </div>
            ))}

            {/* Section hexes */}
            {placed.map(({ item, x, y }) => (
              <div key={item.href + item.label} style={{ position: 'absolute', left: x + ox - HEX_W / 2, top: y + oy - hexH / 2 }}>
                <HexTile item={item} size={HEX_W} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

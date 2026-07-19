'use client';

/**
 * WatercolorBackdrop v4 — nested-sheet watercolor, rasterized once.
 *
 * Anatomy lesson from the reference painting (v3 post-mortem): a watercolor
 * "line" is never an independent stroke — it is the darkened RIM of a
 * translucent sheet. The painting is stacks of nested sheets; their rims are
 * the intertwined "etheric" lines, which is why they come in families that
 * hug the billow contours (agate banding) and always separate two tones.
 *
 * So v4 paints each color mass as 4 nested, turbulence-displaced contour
 * copies where the fill and its edge stroke live on the SAME path: the line
 * is guaranteed to hug its sheet. Per-copy filter seeds make each rim wander
 * independently — that wander is the liveliness. Short delta forks connect
 * bands where pigment branches.
 *
 * Performance (v3 post-mortem #2): the SVG is serialized to a data: URI and
 * rendered through <img>, so the browser rasterizes the turbulence filters
 * ONCE at decode and then treats the painting as a cached bitmap — zero
 * per-frame filter cost. Light/dark are two cached variants toggled by the
 * theme class. Still zero assets and CSP-clean.
 *
 * `tint` leans the composition toward the module you're standing in by
 * reweighting the warm/cool/violet sheet systems plus a glaze.
 */

import { useMemo } from 'react';

export type WashTint =
  | 'neutral' | 'blue' | 'cyan' | 'rose' | 'amber' | 'orange' | 'green' | 'violet';

interface TintWeights {
  warm: number;
  cool: number;
  violet: number;
  glaze: string | null;
  glazeOpacity: number;
}

const TINTS: Record<WashTint, TintWeights> = {
  neutral: { warm: 1,    cool: 1,    violet: 1,    glaze: null,      glazeOpacity: 0 },
  blue:    { warm: 0.72, cool: 1.3,  violet: 0.8,  glaze: '#4a7fb5', glazeOpacity: 0.06 },
  cyan:    { warm: 0.72, cool: 1.25, violet: 0.75, glaze: '#22a3b8', glazeOpacity: 0.05 },
  rose:    { warm: 1.3,  cool: 0.68, violet: 0.9,  glaze: '#e05572', glazeOpacity: 0.05 },
  amber:   { warm: 1.35, cool: 0.7,  violet: 0.75, glaze: '#eaa62f', glazeOpacity: 0.05 },
  orange:  { warm: 1.35, cool: 0.7,  violet: 0.7,  glaze: '#ef7d3a', glazeOpacity: 0.05 },
  green:   { warm: 0.72, cool: 1.15, violet: 0.75, glaze: '#2f9e77', glazeOpacity: 0.06 },
  violet:  { warm: 0.7,  cool: 0.85, violet: 1.5,  glaze: '#7a5bd0', glazeOpacity: 0.06 },
};

/* ─── Deterministic geometry (SSR-safe, cache-stable) ────────── */

type Pt = [number, number];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth closed path through points (Catmull-Rom → cubic bezier). */
function closedPath(pts: Pt[]): string {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

function centroid(pts: Pt[]): Pt {
  const s = pts.reduce<Pt>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

interface MassSpec {
  pts: Pt[];
  fill: string;
  edge: string;
  seedBase: number;
}

/** A mass = nested displaced sheets; each sheet's stroke IS its rim. */
function massSheets(spec: MassSpec): string {
  const [cx, cy] = centroid(spec.pts);
  const scales = [1, 0.85, 0.7, 0.55];
  const fillOp = [0.16, 0.15, 0.14, 0.13];    // accumulates toward the core
  const edgeOp = [0.2, 0.26, 0.32, 0.38];     // inner rims read stronger
  const edgeW  = [2.2, 2.0, 1.8, 1.6];
  let out = '';
  scales.forEach((s, i) => {
    const rnd = mulberry32(spec.seedBase * 7919 + i * 104729);
    const jitter = 8 + i * 3;
    const pts: Pt[] = spec.pts.map(([x, y]) => [
      cx + (x - cx) * s + (rnd() - 0.5) * jitter * 2,
      cy + (y - cy) * s + (rnd() - 0.5) * jitter * 2,
    ]);
    out += `<path d="${closedPath(pts)}" fill="${spec.fill}" fill-opacity="${fillOp[i]}" stroke="${spec.edge}" stroke-opacity="${edgeOp[i]}" stroke-width="${edgeW[i]}" filter="url(#f${i})"/>`;
  });
  return out;
}

/* The five masses — same silhouettes the owner approved as "nice stains". */
const CORAL: MassSpec = {
  seedBase: 3,
  fill: '#ef6a4a', edge: '#b3341f',
  pts: [[-60, 940], [-30, 640], [120, 480], [320, 410], [520, 350], [590, 220], [560, 80], [720, 220], [770, 420], [690, 580], [560, 720], [460, 940]],
};
const AMBER: MassSpec = {
  seedBase: 5,
  fill: '#f5b04c', edge: '#c07617',
  pts: [[380, 740], [430, 600], [560, 510], [720, 470], [870, 420], [1000, 360], [1070, 250], [1090, 380], [1010, 510], [880, 590], [720, 650], [540, 700]],
};
const TEAL: MassSpec = {
  seedBase: 11,
  fill: '#3d9db3', edge: '#155e75',
  pts: [[900, -60], [980, 120], [1010, 280], [950, 420], [890, 540], [910, 650], [1030, 700], [1180, 740], [1290, 660], [1330, 520], [1360, 320], [1380, 120], [1430, -60]],
};
const BLUE: MassSpec = {
  seedBase: 17,
  fill: '#5b7fc7', edge: '#1e40af',
  pts: [[1330, -60], [1420, 140], [1410, 340], [1470, 520], [1540, 640], [1620, 680], [1660, 600], [1660, -60]],
};
const VIOLET: MassSpec = {
  seedBase: 23,
  fill: '#8d6fd0', edge: '#6d28d9',
  pts: [[990, 950], [1010, 810], [1100, 730], [1240, 710], [1380, 730], [1480, 800], [1545, 950]],
};

/* Delta forks — short branches where pigment splits between bands. */
const FORKS: Array<{ d: string; c: string; g: 'warm' | 'cool' | 'violet' }> = [
  { d: 'M 300 640 C 380 590, 430 530, 450 460', c: '#b3341f', g: 'warm' },
  { d: 'M 480 560 C 560 540, 630 500, 660 440', c: '#c2410c', g: 'warm' },
  { d: 'M 640 620 C 740 590, 830 540, 880 470', c: '#c07617', g: 'warm' },
  { d: 'M 1020 250 C 1000 350, 960 430, 900 480', c: '#155e75', g: 'cool' },
  { d: 'M 1160 300 C 1140 420, 1150 520, 1210 590', c: '#1d4ed8', g: 'cool' },
  { d: 'M 1350 200 C 1380 320, 1370 440, 1430 540', c: '#1e40af', g: 'cool' },
  { d: 'M 1120 800 C 1190 770, 1270 760, 1350 780', c: '#6d28d9', g: 'violet' },
];

/* ─── SVG assembly, one string per (tint, theme) ─────────────── */

function buildSvg(tint: WashTint, dark: boolean): string {
  const w = TINTS[tint];
  // Per-sheet displacement filters (4 seeds → rims wander independently).
  const filters = [7, 13, 19, 31]
    .map(
      (seed, i) =>
        `<filter id="f${i}" x="-35%" y="-35%" width="170%" height="170%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.006 0.01" numOctaves="2" seed="${seed}"/>` +
        `<feDisplacementMap in="SourceGraphic" scale="${120 + i * 15}"/>` +
        `<feGaussianBlur stdDeviation="2.2"/>` +
        `</filter>`
    )
    .join('');

  const paper = dark
    ? ''
    : `<rect width="1600" height="900" fill="url(#paper)"/>`;

  const forks = (g: 'warm' | 'cool' | 'violet') =>
    FORKS.filter((f) => f.g === g)
      .map(
        (f) =>
          `<path d="${f.d}" fill="none" stroke="${f.c}" stroke-width="1.7" stroke-opacity="0.22" stroke-linecap="round" filter="url(#f2)"/>`
      )
      .join('');

  const glaze = w.glaze
    ? `<rect width="1600" height="900" fill="${w.glaze}" opacity="${w.glazeOpacity}"/>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">` +
    `<defs>${filters}` +
    `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#fdf6ee"/><stop offset="45%" stop-color="#fbf3f0"/><stop offset="100%" stop-color="#eef4f8"/>` +
    `</linearGradient></defs>` +
    paper +
    `<g opacity="${w.warm}">${massSheets(CORAL)}${massSheets(AMBER)}${forks('warm')}</g>` +
    `<g opacity="${w.cool}">${massSheets(TEAL)}${massSheets(BLUE)}${forks('cool')}</g>` +
    `<g opacity="${w.violet}">${massSheets(VIOLET)}${forks('violet')}</g>` +
    glaze +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const svgCache = new Map<string, string>();
function cachedSvg(tint: WashTint, dark: boolean): string {
  const key = `${tint}:${dark ? 'd' : 'l'}`;
  let uri = svgCache.get(key);
  if (!uri) {
    uri = buildSvg(tint, dark);
    svgCache.set(key, uri);
  }
  return uri;
}

export default function WatercolorBackdrop({
  intensity = 'ambient',
  tint = 'neutral',
}: {
  intensity?: 'hero' | 'ambient';
  tint?: WashTint;
}) {
  const strength = intensity === 'hero' ? 1 : 0.65;
  const light = useMemo(() => cachedSvg(tint, false), [tint]);
  const dark = useMemo(() => cachedSvg(tint, true), [tint]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={light}
        alt=""
        className="absolute inset-0 h-full w-full object-cover dark:hidden"
        style={{ opacity: strength }}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dark}
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover dark:block"
        style={{ opacity: strength * 0.55 }}
        draggable={false}
      />
    </div>
  );
}

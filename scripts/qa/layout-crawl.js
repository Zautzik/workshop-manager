/**
 * Layout guard (plan 2026-11-25, F8): opens every page at four widths and
 * reports what does not fit.
 *
 * Format: a Playwright function `async (page) => …`, so it runs as-is from the
 * Playwright MCP tool (browser_run_code with `filename: scripts/qa/layout-crawl.js`)
 * against the dev server with the dev login bypass. The project does not
 * depend on Playwright itself; wrapping this in `npm run qa:layout` would need
 * `@playwright/test` as a dev dependency.
 *
 * Fails (listed under `fail`):
 *   - sideways scroll: the page scroller or the document is wider than the screen
 *   - clipped: visible content past the right edge, not inside its own scroll box
 *   - stretched (2560 only): content wider than the 1600 px cap on a capped page
 * Warns (listed under `warn`, phone only):
 *   - text under 12 px
 *   - tap targets (buttons, links, inputs) under 32 px tall
 *
 * Set `ONLY` to a list of routes to check a subset.
 */
async (page) => {
  const BASE = 'http://localhost:3001';
  const ONLY = null; // e.g. ['/home', '/comercial/clientes']
  const ROUTES = ONLY ?? [
    '/home', '/administracion', '/administracion/diagnostics', '/administracion/flujo-ot',
    '/administracion/integrations', '/administracion/notifications', '/administracion/settings',
    '/administracion/users', '/analitica', '/analitica/calibracion', '/analitica/costos',
    '/analitica/dashboard', '/analitica/maquinas', '/analitica/nomina', '/analitica/rendimiento',
    '/analitica/rentabilidad', '/analitica/tendencias', '/calidad', '/calidad/certificaciones',
    '/calidad/expediente', '/calidad/recall', '/calidad/retencion', '/calidad/retiro',
    '/calidad/trazabilidad', '/comercial', '/comercial/clientes', '/comercial/cotizaciones',
    '/comercial/despachos', '/comercial/pipeline', '/equipos', '/equipos/carga', '/equipos/economia',
    '/equipos/etiquetas', '/equipos/historial', '/equipos/lectura', '/equipos/mantenciones',
    '/equipos/maquinas', '/equipos/mecanica', '/equipos/ordenes', '/operaciones',
    '/operaciones/calendar', '/operaciones/captures', '/operaciones/compras', '/operaciones/escanear',
    '/operaciones/hoja-produccion', '/operaciones/inventario', '/operaciones/kanban',
    '/operaciones/ordenes-en-proceso', '/operaciones/planta', '/operaciones/pre-prensa',
    '/operaciones/proveedores', '/operaciones/whatsapp', '/personas', '/personas/consola',
    '/personas/talento', '/legal/privacidad', '/login',
  ];
  // Full-width on purpose — keep in step with WIDE_ROUTES / LAUNCHER_ROUTES in
  // src/components/AppShell.tsx: the boards, and the hex launchers.
  const WIDE = [
    '/operaciones/calendar', '/operaciones/kanban', '/operaciones/planta',
    '/home', '/operaciones', '/calidad', '/comercial', '/personas', '/equipos', '/analitica', '/administracion',
  ];
  // A full run is ~230 page loads; split it by width when a tool call has a time limit.
  const ONLY_VIEWPORTS = null; // e.g. ['phone']
  const VIEWPORTS = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'laptop', width: 1280, height: 720 },
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'wide', width: 2560, height: 1440 },
  ].filter((v) => !ONLY_VIEWPORTS || ONLY_VIEWPORTS.includes(v.name));

  const results = { fail: [], warn: [], checked: 0 };

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(2500);
        const m = await page.evaluate(({ phone, wideCheck }) => {
          const W = innerWidth;
          const visible = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          // The shell scrolls inside main > div.overflow-y-auto; with overflow-y set,
          // overflow-x computes to auto too, so a too-wide page scrolls sideways there.
          const scroller = document.querySelector('main > div.overflow-y-auto');
          const sideways = Math.max(
            document.documentElement.scrollWidth - W,
            scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
          );
          // Past the right edge is fine only inside a box the user can scroll
          // (a wide table, the Gantt). Under overflow hidden/clip it is simply
          // cut off and unreachable — that is the failure this guard exists for.
          const ownScrollBox = (el) => {
            for (let p = el.parentElement; p && p !== scroller && p !== document.body; p = p.parentElement) {
              const cs = getComputedStyle(p);
              const ox = cs.overflowX;
              if (ox === 'auto' || ox === 'scroll') return p.getBoundingClientRect().right <= W + 1;
              // Deliberate truncation with an ellipsis inside the screen is not
              // lost content: the text ends in "…" (and should carry a title).
              if (cs.textOverflow === 'ellipsis' && ox === 'hidden') return p.getBoundingClientRect().right <= W + 1;
            }
            return false;
          };
          const root = document.querySelector('main') || document.body;
          let clipped = 0; let clipSample = '';
          let small = 0; let smallSample = '';
          let taps = 0; let tapSample = '';
          let contentLeft = Infinity; let contentRight = 0;
          for (const el of root.querySelectorAll('*')) {
            if (el.closest('header')) continue;
            const r = el.getBoundingClientRect();
            if (!visible(el, r)) continue;
            if (r.right > W + 1 && !ownScrollBox(el) && el.children.length === 0) {
              clipped++; if (!clipSample) clipSample = `${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 30)}" right=${Math.round(r.right)}`;
            }
            if (wideCheck && el.children.length === 0 && (el.textContent || '').trim()) {
              contentLeft = Math.min(contentLeft, r.left); contentRight = Math.max(contentRight, r.right);
            }
            if (phone) {
              const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
              if (own && parseFloat(getComputedStyle(el).fontSize) < 12) {
                small++; if (!smallSample) smallSample = `"${el.textContent.trim().slice(0, 25)}" ${getComputedStyle(el).fontSize}`;
              }
              if (el.matches('button, a[href], input, select, [role=button], [role=tab]') && r.height < 32 && !el.closest('table')) {
                taps++; if (!tapSample) tapSample = `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 25)}" ${Math.round(r.height)}px`;
              }
            }
          }
          return { sideways, clipped, clipSample, small, smallSample, taps, tapSample,
            span: wideCheck && contentRight > 0 ? Math.round(contentRight - contentLeft) : 0 };
        }, { phone: vp.name === 'phone', wideCheck: vp.name === 'wide' });

        results.checked++;
        const tag = `${vp.width} ${route}`;
        if (m.sideways > 1) results.fail.push(`${tag}: scrolls sideways by ${m.sideways}px`);
        if (m.clipped) results.fail.push(`${tag}: ${m.clipped} clipped, e.g. ${m.clipSample}`);
        // Judge the page actually shown: index routes like /equipos/lectura redirect.
        const landed = new URL(page.url()).pathname;
        if (vp.name === 'wide' && !WIDE.includes(landed) && m.span > 1600 + 64) results.fail.push(`${tag}: content spans ${m.span}px (cap 1600)`);
        if (m.small) results.warn.push(`${tag}: ${m.small} text <12px, e.g. ${m.smallSample}`);
        if (m.taps) results.warn.push(`${tag}: ${m.taps} tap targets <32px, e.g. ${m.tapSample}`);
      } catch (e) {
        results.fail.push(`${vp.width} ${route}: did not load (${String(e.message || e).slice(0, 80)})`);
      }
    }
  }
  return results;
}

#!/usr/bin/env node
/**
 * npm run qa:layout          → every page at phone, laptop, desktop and wide
 * npm run qa:layout:phone    → phone only (the quick pre-deploy check)
 *
 * Options:
 *   --widths=phone,laptop     subset of phone | laptop | desktop | wide
 *   --routes=/home,/equipos   subset of routes
 *   BASE_URL=http://…         target (default http://localhost:3001, the dev
 *                             server with the dev login bypass)
 *
 * Runs the same check the Playwright MCP tool runs (scripts/qa/layout-crawl.js)
 * in a headless Chromium, prints failures and warnings, and exits 1 on any
 * failure so it can gate a deploy or a CI job.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
// Git Bash on Windows rewrites "/home" into "C:/Program Files/Git/home" before
// the script sees it; undo that so the same command works in every shell.
const route = (r) => r.replace(/^[A-Za-z]:\/.*?\/Git(?=\/)/, '');

globalThis.__LAYOUT_OPTS = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',
  widths: list(arg('widths')),
  routes: list(arg('routes'))?.map(route),
};

// The check is one function expression, shared with the MCP tool.
const crawl = (0, eval)(readFileSync(new URL('./layout-crawl.js', import.meta.url), 'utf8'));

const started = Date.now();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  console.log(`Layout check → ${globalThis.__LAYOUT_OPTS.baseUrl} (${globalThis.__LAYOUT_OPTS.widths?.join(', ') ?? 'all widths'})`);
  const r = await crawl(page);
  for (const w of r.warn) console.log(`  warn  ${w}`);
  for (const f of r.fail) console.log(`  FAIL  ${f}`);
  console.log(`\n${r.checked} page loads, ${r.fail.length} failures, ${r.warn.length} warnings · ${Math.round((Date.now() - started) / 1000)} s`);
  process.exitCode = r.fail.length > 0 ? 1 : 0;
} finally {
  await browser.close();
}

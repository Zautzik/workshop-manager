#!/usr/bin/env node
/**
 * Smoke test — the tripwire this repo was missing (demo plan §7.1).
 *
 * The 2026-07 audit found /api/employees hard-500ing for weeks with nobody
 * noticing, a VB→OT converter that had never worked, and mock data hiding
 * behind a 200. This script makes that class of silent breakage impossible:
 *
 *   1. READ SWEEP (always): GETs every core endpoint and asserts HTTP 200
 *      with parseable JSON — an HTML 404/500 page fails loudly.
 *   2. AUTH COVERAGE (always, static): walks src/app/api and asserts every
 *      route.ts calls requireAuth() or is on the explicit public allowlist.
 *      A new unauthenticated route fails the build until it's deliberate.
 *   3. GOLDEN THREAD (--mutate only): exercises the OT lifecycle guards
 *      end-to-end (create → duplicate 409 → status side-door still closed →
 *      transition → active list → real costs → completed_at). Writes
 *      [SMOKE]-tagged rows — run it against dev/demo databases, not prod.
 *
 * Usage:  node scripts/smoke.mjs [--mutate]
 * Env:    SMOKE_BASE_URL (default http://localhost:3000)
 * Exit:   0 all green · 1 any failure (CI-friendly)
 *
 * Requires the app to be running with auth satisfied (dev bypass locally).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const MUTATE = process.argv.includes('--mutate');

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function getJson(path, { expect = 200 } = {}) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or garbage */ }
  return { status: res.status, json, isJson: json !== null, expectOk: res.status === expect };
}

/* ── 1 · Read sweep ──────────────────────────────────────────── */

const READ_ENDPOINTS = [
  '/api/health',
  '/api/ots?limit=5',
  '/api/ots?active=true&limit=5',
  '/api/ots/cost-summary',
  '/api/ots/cycle-analytics',
  '/api/ots/fulfillment',
  '/api/ots/generate-number',
  '/api/ot-templates',
  '/api/vistos-buenos',
  '/api/purchases',
  '/api/sales-invoices',
  '/api/dispatch-guides',
  '/api/clients',
  '/api/machines?limit=5',
  '/api/workers?limit=5',
  '/api/employees?limit=5',
  '/api/suppliers',
  '/api/supplier-categories',
  '/api/captures',
  '/api/whatsapp/logs?limit=5',
  '/api/whatsapp/summary',
  '/api/whatsapp/simulate',
  '/api/cost-catalog',
  '/api/cost-alerts',
  '/api/certifications',
  '/api/recall',
  '/api/vitals',
  '/api/reporting/snapshots',
  '/api/search/advanced?q=smoke',
  '/api/admin/users?limit=3',
];

async function readSweep() {
  console.log(`\n■ Read sweep (${READ_ENDPOINTS.length} endpoints) — ${BASE}`);
  for (const ep of READ_ENDPOINTS) {
    try {
      const r = await getJson(ep);
      if (!r.expectOk) fail(`${ep} → HTTP ${r.status}${r.isJson && r.json?.error ? ` (${r.json.error})` : ''}`);
      else if (!r.isJson) fail(`${ep} → 200 but NOT JSON (HTML error page?)`);
      else ok(ep);
    } catch (e) {
      fail(`${ep} → ${e.message}`);
    }
  }
}

/* ── 2 · Auth coverage (static) ──────────────────────────────── */

// Routes that are legitimately public or carry their own gate.
const PUBLIC_ALLOWLIST = [
  'api/health/route.ts',              // liveness probe
  'api/track/[token]/route.ts',       // public tracker (share_token-gated)
  'api/whatsapp/webhook/route.ts',    // HMAC signature-gated
  'api/whatsapp/warehouse/webhook/route.ts', // HMAC signature-gated
  'api/auth/[...nextauth]/route.ts',  // NextAuth itself
  'api/attendance/clock/route.ts',    // QR kiosk (credential-in-body, no session)
];

function walkRoutes(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkRoutes(p, acc);
    else if (entry === 'route.ts') acc.push(p);
  }
  return acc;
}

function authCoverage() {
  console.log('\n■ Auth coverage (static scan of src/app/api)');
  const routes = walkRoutes('src/app/api');
  for (const route of routes) {
    const rel = route.replaceAll('\\', '/').replace(/^.*src\/app\//, '');
    const src = readFileSync(route, 'utf8');
    const gated = src.includes('requireAuth');
    const allowed = PUBLIC_ALLOWLIST.some((a) => rel.endsWith(a));
    if (!gated && !allowed) fail(`${rel} has no requireAuth and is not allowlisted`);
    else ok(`${rel}${gated ? '' : '  (public by design)'}`);
  }
}

/* ── 3 · Golden thread (mutating) ────────────────────────────── */

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function goldenThread() {
  console.log('\n■ Golden thread (mutating — [SMOKE] rows land in this DB)');
  const num = `SMOKE-${Date.now().toString().slice(-8)}`;

  // create with priority_level → mapped priority (audit P1.5)
  const created = await post('/api/ots', {
    ot_number: num, client_name: '[SMOKE] Prueba automática', quantity: 100,
    priority_level: 'urgente', notes: '[SMOKE] fila de prueba — purgable',
  });
  if (created.status !== 201 || created.json?.priority !== 10) {
    return fail(`create: HTTP ${created.status}, priority ${created.json?.priority} (expected 201 / 10)`);
  }
  ok('create → 201, urgente mapped to priority 10');
  const id = created.json.id;

  // duplicate number → 409 (audit P1.10)
  const dup = await post('/api/ots', { ot_number: num, client_name: 'x', quantity: 1 });
  dup.status === 409 ? ok('duplicate ot_number → 409') : fail(`duplicate → HTTP ${dup.status} (expected 409)`);

  // status side door must stay closed (audit P1.4)
  const patch = await fetch(`${BASE}/api/ots/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });
  const afterPatch = await patch.json().catch(() => null);
  afterPatch?.status === 'pre_press'
    ? ok('PATCH {status} ignored — side door closed')
    : fail(`PATCH status leaked: status=${afterPatch?.status}`);

  // transition into the workflow; digital_printing must appear in active list (audit P1.6)
  const t1 = await post(`/api/ots/${id}/transition`, { to_status: 'digital_printing', reason: '[SMOKE]' });
  t1.status === 200 ? ok('transition → digital_printing') : fail(`transition → HTTP ${t1.status}`);
  const active = await getJson('/api/ots?active=true&limit=200');
  active.json?.data?.some((o) => o.id === id)
    ? ok('digital_printing OT visible in active list')
    : fail('OT missing from active list');

  // completed requires real costs (gate), then completed_at stamps (audit P1.4b/P1.8)
  const blocked = await post(`/api/ots/${id}/transition`, { to_status: 'completed' });
  blocked.status === 400 ? ok('completed without costs → blocked') : fail(`cost gate missing: HTTP ${blocked.status}`);
  const costs = await post(`/api/ots/${id}/real-costs`, {
    workflow_step: 'digital_printing',
    costs: [{ operation_code: 'SMK', description: '[SMOKE] costo', category: 'impresion', quantity: 1, unit: 'h', unit_cost: 1000 }],
  });
  costs.status === 201 ? ok('real costs recorded') : fail(`real-costs → HTTP ${costs.status}`);
  const done = await post(`/api/ots/${id}/transition`, { to_status: 'completed', reason: '[SMOKE]' });
  done.status === 200 ? ok('transition → completed') : fail(`final transition → HTTP ${done.status}`);
  const final = await getJson(`/api/ots?limit=200`);
  const row = final.json?.data?.find((o) => o.id === id);
  row?.completed_at ? ok('completed_at stamped') : fail('completed_at missing after completion');
}

/* ── run ─────────────────────────────────────────────────────── */

const started = Date.now();
await readSweep();
authCoverage();
if (MUTATE) await goldenThread();
else console.log('\n■ Golden thread skipped (pass --mutate to run against a dev/demo DB)');

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures > 0) {
  console.error(`\nSMOKE FAILED — ${failures} problem(s) in ${secs}s`);
  process.exit(1);
}
console.log(`\nSMOKE GREEN in ${secs}s`);

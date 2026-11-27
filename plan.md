# GonsAdmin — Master plan to go live

Last updated: 2026-11-27 · Branch `audit/captura-local-fase-1a` = `master` (`b7f103c`)

This file says where the project stands and what is left before the print shop
runs on it. Read it at the start of every session and tick items as they close.
Details live in the linked docs; this is the map.

**Legend.** Size: S ≤ ½ day · M 1–3 days · L 1–2 weeks.
Who: **Owner** = a decision or input only you can give · **Dev** = code/ops work.
Every step lists a *Done when* — the check that proves it, not "looks done".

---

## 0. Where we stand

**Built and live on staging** (workshop-manager-pi.vercel.app, Supabase
`sgnbbatucphbqhahgczq`):

- Quote → OT → route → planning → shop floor (Tablero + WhatsApp) → real cost →
  dispatch → invoice. One writer per fact (the "golden thread"): `moveOT` moves
  OTs, `apply_capture_event` applies reports, `stage-valuation` values machine
  time, the inventory trigger values material, Planta shifts value labour.
- Audits from 2026-10 and 2026-11 are closed (Phases 0–3 of
  [docs/plan-arreglos-y-pantallas-2026-11-25.md](docs/plan-arreglos-y-pantallas-2026-11-25.md)).
- Works on phone, laptop and wide screens; `npm run qa:layout` checks it (228
  page loads, 0 failures). Phone planning: heat map / now-next / risk + stage panel.
- Every one of the 216 migrations is applied to the cloud (verified 2026-11-27).
- Checks green: typecheck, lint 0 errors, 1,303 unit tests, read-route
  integration tests.

**Not ready for real use, in one sentence:** the database is all demo data, no
one but admins has used it, there is no tested way to restore it, and the
hosting plans are the free ones.

---

## 1. Go-live gates (all must be true)

| # | Gate | Phase |
| --- | --- | --- |
| G1 | No known high/critical security issue; every role tested with a real non-admin account | B, F |
| G2 | Production database created from a clean baseline, with real data loaded and reconciled | C, D |
| G3 | A backup has been restored successfully at least once, and the downtime procedure is written | E |
| G4 | Each role has run a full day on staging; the golden-thread end-to-end test passes | F |
| G5 | Errors and downtime reach someone automatically | G |
| G6 | People are trained; a parallel run matched paper for at least 1 week | H |

---

## Phase A — Owner decisions and inputs (start now; they gate the rest)

These cannot be answered from code. Each one blocks a later step.

| # | Decision / input | Why it matters | Blocks |
| --- | --- | --- | --- |
| A1 | **Hosting plans.** ✅ Decided 2026-11-27: Vercel Pro + Supabase Pro, bought once the dev work is finished. | A business running on Free tiers breaks terms and has no safety net. | C1 (create step), E1 |
| A2 | **Go-live date and scope.** All modules at once, or pilot first (recommended: Cotizaciones + OT + Tablero + WhatsApp on one press line, then the rest). | Sets the order of D and H. | D, H |
| A3 | **Real data sources.** Who provides and checks each list in D2 (clients, suppliers, employees, machines and rates, paper/ink stock, price list, maintenance plans). | Data loading is the longest step and depends on people, not code. | D2 |
| A4 | **Users and roles.** List of every person, their role (admin, supervisor, manager, vendedor, técnico, bodega, hr_manager…) and their WhatsApp number. | Accounts, permissions and WhatsApp identity come from this. | B4, F2 |
| A5 | **Lunch hour.** Taller lunch is assumed 13:00–14:00 (unpaid). Confirm or correct. | Feeds payroll hours and the planning calendar. | D2 |
| A6 | **Downtime procedure.** Answer the four questions in [docs/backup-y-restauracion.md §5](docs/backup-y-restauracion.md): OT numbering without the app, where reports are written, who warns operators, how long the shop can run on paper. | Without it, a restored database still leaves a gap nobody knows how to fill. | E3 |
| A7 | **Meta WhatsApp.** Template approval (pending with Meta) and the production phone number. | Outbound messages (maintenance alerts, notices) need approved templates. | F4 |
| A8 | **Electronic invoicing (Nubox).** Owner decided 2026-11-25 it does not block launch. Confirm invoices keep being issued outside the app until it is switched on. | Legal invoicing must not fall in a gap during the switch. | I1 |
| A9 | **Domain and email.** App URL (e.g. `app.gonsa.cl`) and the sender address for system emails. | Customer approval links (`/track/…`) and quotes carry this URL. | C3 |

---

## Phase B — Security and safety fixes (Dev, before any real data)

**B1 · Patch dependencies (S).** ✅ 2026-11-27: zod 3 → 4.6.7 (`.uuid()` → `.guid()` keeps v3's loose check; `z.record` gets its key type), Sentry 10.78, patch fixes. No high/critical left; 5 moderate remain, all `glob` inside Sentry's build-time plugin — needs Sentry 11, moved to I8.
 `npm audit` reports 9 issues; one is high
(`zod` < 4.6.6, memory exhaustion on oversized input — GHSA-mrhx-c7xc-m3w5).
Steps: try `npm audit fix` (non-breaking ones); for zod, check whether the app
uses zod 3 (`^3.25.76`) and whether the advisory applies to it; upgrade or pin
the patched line; run typecheck, tests, build.
*Done when:* `npm audit --omit=dev` shows no high/critical.

**B2 · Customer approval goes through `moveOT` (M).** ✅ 2026-11-27. Also fixed: `moveOT` ignored a portal approval for the paper-purchase gate (rule now in `aprobacionParaMover`, tested).
 The approval link
(`src/app/api/track/[token]/approval/route.ts:205`) still updates `ots.status`
directly — the last side door from audit C-3. It skips whatever `moveOT` does
(history, alerts, paper rules, cache). Steps: call `moveOT` with a system actor;
keep the token as the only authorization; write a test where a customer
approval moves the OT and writes the same history as the Tablero.
*Done when:* `grep "from('ots').update" src/app/api` returns only `moveOT`'s own path.

**B3 · Webhook idempotency check (S).** ✅ code 2026-11-27, ⏳ migration `20261127120000` waiting for cloud push. Found two real bugs: (1) one message with FIN + INICIO lost the INICIO as a "duplicate" — each event now keys `wamid`, `wamid#1`…; (2) bodega deduped only within 60 s — now keyed by wamid with a unique index (`src/lib/warehouse-log.ts`). Signatures: fail closed, constant-time — OK.
 Confirm both WhatsApp webhooks
(production and bodega) dedupe on `(wamid, event_index)` and verify Meta's
signature. Add a test that sends the same message twice and one message with
END + START.
*Done when:* tests prove a duplicate delivery writes nothing twice.

**B4 · Test every role with a real account (M).** So far only admin accounts
exist in the cloud. The browser holds a real Supabase JWT, so RLS and grants
are the real boundary. Steps: create one account per role on staging; run
`node scripts/check-anon-visibility.mjs && node scripts/check-rls-drift.mjs`;
log in as each role and walk its screens; confirm a vendedor cannot see costs,
a técnico cannot see money, hr_manager sees only its tabs.
*Done when:* a written role × screen matrix with no unexpected access and no
broken screen.

**B5 · Production switches (S).** Verify in the Vercel production env: dev
login bypass OFF, `NEXTAUTH_SECRET` strong and unique, no `localhost` URLs, no
service-role key in any `NEXT_PUBLIC_*` var. Rotate the service-role key and
WhatsApp tokens once before go-live (they lived in dev `.env` files).
Run `node scripts/verify-csp-wiring.cjs`.
*Done when:* a checklist of env vars signed off; old keys revoked.

**B6 · CI that actually runs (S).** CI failed in Nov for missing GitHub
secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — **Owner**
adds them (or point CI at a throwaway project). Add `npm run qa:layout:phone`
as an optional job.
*Done when:* a push to master shows a green CI run.

---

## Phase C — Production environment (Dev + Owner)

**C1 · Production database from a baseline (L).** The 216 migrations cannot
rebuild the database (they break at #20; see memory/docs S-2). Steps:
1. Dump the staging **schema only** (`supabase db dump`), review it, and save it
   as one baseline migration.
2. Create the production Supabase project (plan from A1).
3. Apply the baseline; add `pg_cron` jobs, storage buckets and the Realtime
   publication; run the RLS/anon audits against it.
4. From then on, new migrations go to staging first, then production.
*Done when:* an empty production DB passes `check-anon-visibility`,
`check-rls-drift`, and the app's health check.

**C2 · Production Vercel project (S).** Point the production deploy at the new
DB; keep the current one as staging (from a `staging` branch).
*Done when:* two environments, each with its own DB, and you know which URL is which.

**C3 · Domain, email and webhooks (S).** Custom domain + HTTPS; Meta webhook
pointed at production (`/api/whatsapp/webhook`, handshake passes); the
quote/approval links use the new domain.
*Done when:* a test message from a phone reaches the production review queue.

**C4 · Scheduled jobs (S).** `vercel.json` has only the maintenance cron. Add
a daily `/api/health` ping (keeps the DB active and proves the app is up) and
confirm `pg_cron` jobs (cost-variance snapshot) exist in production.
*Done when:* each job shows a successful run in its log.

---

## Phase D — Real data and cutover (Owner + Dev; the longest phase)

**D1 · Cutover design (S).** Decide the cut date and the rule for OTs in
progress (recommended: open OTs entered with their current stage; closed
history not migrated, kept in the old files).

**D2 · Load master data (L).** One spreadsheet per list, checked by the person
who owns it (A3), loaded by a script that runs first with `npm run db:dry-run`:
- Company data, users and roles (A4), employees with contract and shift.
- Machines with types, rates per hour, make-ready (ajuste), click prices;
  shifts and rotations (Prensas A/B, guillotine, troqueladora).
- Clients (RUT, giro, región, comuna — needed later for DTE), contacts,
  suppliers.
- Paper and ink catalog; **opening stock as lots with their real cost**
  (material is costed at the actual lot cost on consumption).
- Price list / cost catalog used by quotes; die (troquel) shelf.
- Maintenance schedules and checklists per machine; part life where known.
*Done when:* each list is signed off by its owner.

**D3 · Remove demo data (M).** The seed (QA-STRESS-TEST OTs, 218 seed OCs,
demo labour, cloned OTs 41260–41269…) must not reach production. Since
production starts empty (C1), this means: never copy staging data across.
Keep the seed on staging for training.
*Done when:* production has zero rows flagged `source = seed` and no QA OTs.

**D4 · Reconcile (M).** After loading: stock per paper equals the physical
count; open OTs show the right stage and route; one test OT quoted → produced →
dispatched → invoiced gives a margin that someone checks by hand.
*Done when:* stock, OT list and the test margin agree with the shop's own numbers.

---

## Phase E — Backup and recovery (Dev + Owner)

**E1 · Daily off-site backup (S).** Supabase Pro daily backups (A1) **plus**
our own daily dump (schema + data + auth + storage list) to a place outside
Supabase. The steps are in [docs/backup-y-restauracion.md](docs/backup-y-restauracion.md).
*Done when:* 7 consecutive daily dumps exist off-site.

**E2 · Test restore (M) — pending since 2026-10-15.** Restore the latest dump
into a scratch project and open the app against it.
*Done when:* the restored app shows the same OTs, stock and costs; restore
time written down.

**E3 · Recovery runbook (S).** One page: who decides, how to restore, how the
shop works meanwhile (A6), how paper reports are loaded afterwards.
*Done when:* printed and kept at the plant.

---

## Phase F — Testing and acceptance

**F1 · Golden-thread end-to-end test (M).** There is no e2e test (audit S-3).
With `@playwright/test` (already installed): create quote → convert to OT →
route → plan → issue paper → close passes (Tablero and a WhatsApp report) →
dispatch → invoice, asserting cost lines, stock and status at each step. Runs
against the local stack.
*Done when:* `npm run test:e2e` is green and part of the pre-deploy checks.

**F2 · A day per role on staging (M).** Each role (A4) runs a normal day with
the seed: vendedor quotes, supervisor plans and moves, operators report by
WhatsApp, bodega receives and issues, admin invoices. Collect issues in one
list; fix blockers.
*Done when:* every role signs off, or its blockers are fixed.

**F3 · Multi-user and real-time (S).** Two browsers on Tablero/Planificación:
one moves, the other updates without refresh. Not yet tested with two people.
*Done when:* changes appear on the second screen within seconds.

**F4 · WhatsApp from real phones (S).** Each operator sends start/end/merma
messages from their own phone; the supervisor reviews and approves; costs and
stock move once. Includes a maintenance "PAUTA … listo" reply.
*Done when:* 10 real messages processed with no duplicate and no lost report.

**F5 · Slow screens (M).** Certificaciones (~33 s), Habilidades (~31 s) and
Mecánica (~29 s) were slow on load. Fetch per tab and page long lists.
*Done when:* every screen opens in under 3 s on the plant's Wi-Fi.

**F6 · Printouts (S).** Quote PDF, Hoja de Producción, OT ticket, labels/QR
print correctly on the plant's printers.

---

## Phase G — Monitoring and operation

**G1 · Errors (S).** Sentry is wired in code (`sentry.*.config.ts`,
`instrumentation-client.ts`); confirm the DSN is set in production and send a
test error. Alerts go to email/WhatsApp of the admin.

**G2 · Uptime (S).** External monitor on `/api/health` (UptimeRobot or
similar) every 5 min.

**G3 · Weekly health check (S).** Supabase security/performance advisors, cron
logs, WhatsApp messages pending review, failed captures. List in
[docs/organism-vital-signs.md](docs/organism-vital-signs.md).

*Done when (G):* a forced error and a forced outage both reach a person.

---

## Phase H — Training and rollout

1. **H1 · Short guides per role (M).** One page each, with screenshots; a
   WhatsApp message card for operators (what to send, examples).
2. **H2 · Training sessions (M).** By role, on staging, with the seed data.
3. **H3 · Parallel run (L).** 1–2 weeks: paper and app together on the pilot
   line (A2). Each day compare OTs, sheets, merma and hours.
4. **H4 · Go / no-go meeting (S).** Review gates G1–G6.
5. **H5 · Cutover day (S).** Freeze, final data load (D2–D4), switch the
   WhatsApp number, announce.
6. **H6 · Hypercare (2 weeks).** Daily check of review queue, errors and
   costs; a fixed time to collect issues; fixes deployed with the same checks.

---

## Phase I — After launch (upgrades; not blockers)

Ordered by value to the shop.

| # | Item | Why | Size |
| --- | --- | --- | --- |
| I1 | **Nubox DTE on** — credentials, UAT test, "Enviar al SII" button; then guía de despacho (52), notas de crédito/débito (61/56), comuna selector. [docs/nubox-integracion.md](docs/nubox-integracion.md) | Legal invoicing from the job itself; code is built and off. | M–L |
| I2 | **OEE per machine** (availability × performance × quality) | All inputs already exist; cheapest high-value metric. | M |
| I3 | **Hours without an OT** attributed to the OTs the machine ran that shift | Today they are "plant time"; margin per OT misses them. | M |
| I4 | **Blocked-OT ETA** (paper arrival by OC, pending V°B°) | Planning can say when a blocked job can start. | M |
| I5 | **Offline shop-floor station** (PWA for `/estacion`, `/escanear`) | Plant Wi-Fi drops; reports should queue and sync. | L |
| I6 | **One permissions module** (≈197 literal role arrays in `src/app/api`) — audit C-5 | Changing who can do what in one place, not 200. | M |
| I7 | **Code health:** 325 `as any`, 131 lint warnings, big components (PlantaBoard 1,300 lines, OTGanttBoard 1,200), API response-shape sweep | Safer changes, fewer hidden bugs. | L (ongoing) |
| I8 | **Dependency refresh** (supabase-js, Sentry, React Query, Vite config warnings) | Stay on supported versions. | M |
| I9 | **Leftovers:** `ot_machine_schedule.actual_hours` duplicates pass hours; maintenance Phase 7 (drop retired tables); two phone text-size warnings (Tendencias axis, Talento tree) | Remove the last second copies of a fact. | S–M |
| I10 | **Press integration** (JDF/JMF counters) | Automatic counts instead of typed ones, for bigger presses. | L |

---

## Working rules (so this plan stays true)

- One writer per fact; never add a per-channel writer — extend the shared one.
- Every migration: new timestamped file → `npm run db:dry-run` locally →
  explicit OK → push → apply locally → audits (§2 of [AGENTS.md](AGENTS.md)).
- Before each deploy: `npx tsc --noEmit`, `npm run lint`, `npm test` (from
  PowerShell — Git Bash's `c:` path breaks Vitest), `npm run qa:layout:phone`.
- Data changes on real records: ask first; dry-run first.
- Update this file when an item closes: tick it, add the commit hash.

## Progress log

| Date | Item | Commit |
| --- | --- | --- |
| 2026-11-27 | Plan written | — |
| 2026-11-27 | B1 deps, B2 portal → moveOT, B3 WhatsApp idempotency (migration pending) | — |

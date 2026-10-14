# Audit remediation — build plan

Companion to **workshop-manager: the Good, the Bad and the Ugly** (10 Oct 2026). That file lists the findings. This document is the plan: what gets built, in what order, how each step is proved, and where it stops for the owner.

| | |
|---|---|
| Written against | `audit/captura-local-fase-1a @ 5f14a26`, 2026-10-14. Audit was written against `master @ 3a5da0c`. |
| Re-verification | Every audit claim re-checked against this commit on 2026-10-13. Results in §1. |
| House rule | **The owner commits, pushes, runs `supabase db push`, and deletes rows. I do none of those.** Migrations are written as files and left for review. |
| Per-phase gates | `npx tsc --noEmit` clean · `npx eslint src` 0 errors · `npx vitest run` green · `node scripts/smoke.mjs` green under dev bypass · `npm run verify:csp` · `npm run check:migrations` + `check:functions` when SQL changed |
| New npm dependencies | **One**, and only in Phase 4: `@playwright/test` (dev). Everything else uses what is installed. |
| Hard deadline | **30 Oct 2026** — Supabase applies the "tables not exposed by default" change to existing projects. Affects Phase 1C. 16 days out. |
| Execution status | **Partially executed on 2026-10-14.** See [§0](#0-execution-status) before reading the phases. |

---

## 0. Execution status

Written and verified on 2026-10-14. Gates after every change: `tsc --noEmit` clean · `eslint src` **0 errors** (148 warnings, unchanged) · `vitest` **1072 passed / 69 files** (was 1058/67 — fourteen new tests) · `smoke.mjs --static` green · `check:migrations` + `check:functions` clean · `verify:csp` passed.

**The intermittent test failure is diagnosed and fixed.** It was never a logic fault: two time-sensitive tests were hitting vitest's 5 s default — `auth.test.ts` → "con un secreto real, importa limpio" (239 ms in isolation) and `qr-from-photo` → "una etiqueta chica dentro de una foto grande" (1,567 ms). Running tsc + eslint + vitest in one command pushed suite import from ~17 s to ~137 s, and both crossed 5 s with nothing broken. `vitest.config.ts` now sets `testTimeout: 15_000`; the heaviest test keeps its own `20_000` override. Verified by re-running the exact chained command under *worse* load (180 s import): 69 files / 1072 tests green.

A test that turns red depending on what else the machine is doing trains people to read red as noise — which is how `NOTES.md` §12 describes weeks of failed builds going unnoticed. This matters more now that CI runs the suite on a runner slower than this machine.

**Not run:** `npm run build`. A dev server was already running on :3000 and `next build` fights it over `.next`; it was not mine to tear down. CI runs it.

| Phase | State |
|---|---|
| 0 — Backup | **Procedure written** ([`backup-y-restauracion.md`](backup-y-restauracion.md)), `backups/` git-ignored. **No dump taken** — needs the project credential. Owner. |
| 1A — RLS on 12 tables | Migration written, **not pushed** |
| 1B — Views `security_invoker` | Migration written, **not pushed** |
| 1C — Function grants | Migration written, **not pushed** |
| 1D — `search_path` + `pg_temp` | Migration written, **not pushed** |
| 1E — Role gates + `/api/workers` | **Done** — 18 handlers gated, columns narrowed |
| 1F — Role coverage in CI | **Done** — `smoke.mjs` extended, wired into CI |
| 2 — HR data path | **DONE for the four live HR tabs** (see §0 below). Q-1 answered YES on 2026-10-14: same screen, same session, two data paths — Equipo (service role) populated, Contratos (browser `anon`) empty. The tab now renders **38 contracts**. A live bug fix, not hygiene. |
| 3A, 3E, 3G | **Done** |
| 3B, 3C, 3D, 3F | Not started — UI work |
| 4A, 4B | **Done** — `CRON_SECRET` fails closed, CI on Node 22, `engines` + `.nvmrc` |
| 4C, 4D | Not started |
| 5A, 5C, 5D | **Done** |
| 5B, 5E, 5F | Not started |
| 6A, 6C | **Done** — `.env.example` complete, README counts corrected |
| 6B, 6D–6J | Not started |

### Phase 2B + 9b.A — executed together, 2026-10-14

Done in one pass so the four files were touched once, not twice.

**Four read endpoints** (none existed — both pre-existing routes were POST-only, which is *why* the components read the browser client):

| Endpoint | Roles | Serves |
|---|---|---|
| `GET /api/hr/contracts` | admin, hr_manager | `employment_contracts` + employee name/dept |
| `GET /api/hr/skill-certifications` | admin, supervisor, hr_manager | `employee_skills` + employee + skill |
| `GET /api/leave-requests` *(added)* | admin, hr_manager, supervisor | `leave_requests` + employee |
| `GET /api/incentives` *(added)* | admin, hr_manager | `incentive_rules` |

**Four components moved** out of route files into [`src/components/hr/`](../src/components/hr/) and repointed to those endpoints: `ContratosContent`, `LicenciasContent`, `CertificacionesContent`, `IncentivosContent`. Each now renders a **distinct error state** — conflating "failed" with "empty" is what hid this bug, and `CertificacionesContent` had already been bitten by the same conflation in 2026-08 for a different reason (a `42703` on a dead column), as its own comment recorded.

**Four routes became redirects** to the tab that replaced them, following the house pattern rather than 404-ing: `/personas/contratos` → `consola?tab=contratos`, `/personas/licencias` → `consola?tab=asistencia`, `/personas/certificaciones` → `talento?tab=certificaciones`, `/personas/incentivos` → `talento?tab=incentivos`.

**`?tab=` had to be made real.** Both shells used uncontrolled `<Tabs defaultValue>` and never read the query string, so the redirects the plan specified would have landed on the wrong tab. Added [`useTabFromUrl`](../src/hooks/use-tab-from-url.ts), which validates against each screen's own tab list — `Tabs` with an unknown `defaultValue` selects nothing and renders blank. Five tests cover it, including that all four redirect targets are valid tabs. Both shells now split the tab block into an inner component under `<Suspense>`, which `useSearchParams` requires.

Also: `PersonasModule`'s Certificaciones and Incentivos cards point straight at the tab URLs instead of bouncing through a redirect, and an unused `supabase` browser-client import was removed from `CraftSkillTree`.

**The 38-vs-389 question is closed.** The Contratos tab renders **38 contracts**, not the 389 reported earlier from a count. PostgREST uses **LEFT JOIN for embedded resources by default** (`!left` exists only to override `!inner`), so `employees(full_name, department)` cannot drop contracts whose `employee_id` fails to resolve — if the table held 389, the endpoint would have returned 389. The table has 38; the 389 was a misread. **I had already written 389 into four code comments as established fact from a single secondhand number** — the audit's own failure mode, repeated. All four are corrected.

That near-miss produced a guard worth more than the number: [`ListaRecortada`](../src/components/hr/ListaRecortada.tsx). The read endpoints return an exact `total` and the components were showing `rows.length`, which agree only while the rows fit under the limit. Past 500 the tab would have shown 500 with the same confidence it previously showed 0 of 38. All four tabs now warn when `total > loaded`, so an incomplete count can no longer pass as a fact about the plant. Fixing it also closed four `react-hooks/exhaustive-deps` warnings my own first version introduced — warnings back to 148, unchanged from baseline.

### Phase 2C — the views are off the browser, and 1B-bis is gone

**There were four browser-read views, not three.** The fourth, `inventory_low_stock_alerts_v`, is queried as `.from('inventory_low_stock_alerts_v' as any)` — the `as any` before the closing paren hid it from the `.from('…')` pattern of the first sweep. **Migration `121000` as written would therefore have silently switched off the low-stock alerts**: the view stops answering, the screen shows zero alerts, and zero alerts reads as "nothing is short". Caught only by re-scanning with a looser pattern.

All four reads moved to role-gated routes (`admin`/`manager`/`supervisor`/`technician`, matching the `/api/inventory/lots` precedent):

| Route | Serves | Replaces |
|---|---|---|
| `GET /api/inventory/levels` | `inventory_items_stock_v` | `useInventory`, `useInventoryItems` |
| `GET /api/inventory/movements` | `inventory_stock_transactions_v` | `useInventoryTransactions` |
| `GET /api/inventory/low-stock` | `inventory_low_stock_alerts_v` | `useInventoryLowStockAlerts` |
| `GET /api/planta/live` | `planta_live` | `usePlantaLive` |

`/api/inventory/stock` was deliberately **not** reused: it reads the same view but with seven columns, `is_active` only and `limit(50)`, which suits its one caller (a search picker in `use-procurement-queries`). Swapping to it would have silently changed what the admin screens show. That route also turns a query error into `[]` and continues — the same silence pattern, noted but not touched.

The movements route keeps the `fetchAll` pagination, moved server-side: its hook's comment records that an unranged query hits PostgREST's 1,000-row cap, which in this repo already made a margin read 82% instead of 22%. The route paginates to exhaustion and returns `truncated`, which the hook now raises as an error rather than charting 30 days off a clipped ledger.

**So migration `121000` no longer needs an exclusion list — it flips every view — and `1B-bis` does not exist.**

While rewriting it I introduced and caught a parse-breaking bug: JavaScript's `String.replace` treats `$$` in the replacement as an escaped `$`, so `DO $$` became `DO $`. All four migrations were re-audited for balanced dollar-quotes (and `ci.yml`'s `${{ secrets }}` for the same hazard).

**Phase 2 is still not finished.** The sweep found a larger surface than first stated: **14 files reading 24 distinct tables/views from the browser**, not the four tables named earlier. Remaining, by behaviour:

- **Returns nothing today** (RLS on, read policies gate on `auth.uid()`): `employees`, `employment_contracts`, `compensation_rates`, `employee_incentives`, `employee_skills`, `hr_documents`, `leave_balances`, `leave_requests`, `user_roles`, `machine_costs`, `equipment_investments`, `inventory_items`
- **Works and is anon-readable**: `batches` (no RLS), plus `jobs`, `machines`, `worker_assignments`, `maintenance_work_orders`, `machine_cost_entries`, `machine_supply_requirements` (permissive read policies)

That static split is approximate — it ignores the `TO` clause (a `TO authenticated` policy never matches this app's `anon`) and mis-bucketed `scheduling_cost_models`, which the empirical probe proved leaks. **`npm run check:anon` is the ground truth**, and the remedy is the same either way: move the read server-side behind a role gate.

### The most urgent thing found while executing

**`get_employee_cost_timeline` was a live salary leak.** It is `SECURITY DEFINER` (reads past RLS), has no `search_path`, never had Postgres' default `EXECUTE … TO PUBLIC` revoked, returns `base_pay`, `ot50_pay`, `ot100_pay`, `night_differential`, `weekend_differential`, `overtime_premium` and `incentive_pay` per employee per period — and was called **from the browser as `anon`** at `use-financial-queries.ts:448`. It worked *because* of the ungranted default. Anyone with the publishable key could ask for any employee's remuneration by UUID.

Fixed in this pass: the read moved to [`/api/employees/[id]/cost-timeline`](../src/app/api/employees/[id]/cost-timeline/route.ts) behind the same `admin`/`hr_manager` gate the wage write side uses, and migration 1C revokes the grant. **The two must land together** — the route alone does not close the hole, and the migration alone breaks the screen.

### Corrections to this document's own §1.3

- **`search_path`: the audit's "5" was right; my "3" was wrong.** My first scanner used a fixed 4,000-character window and missed two long function bodies. Re-scanned with a proper dollar-quote parser: 75 functions, 50 `SECURITY DEFINER`, **5** with no `search_path` (`get_employee_cost_timeline`, `get_order_labor_margin`, `feed_whatsapp_to_real_costs`, `estimate_ot_hours`, `sync_purchase_ledger`), and **45** whose `search_path` lacks `pg_temp`.
- **Views: 26 live, not 20 or 21.** Replaying `CREATE`/`DROP` chronologically. Both the audit's count and my first one were low.
- **Anon-readable tables: 3, not 5.** My first scan ignored `DROP POLICY`. `ots` and `worker_assignments` had their permissive policies dropped and replaced in the next migration. The three real ones are `workstations`, `shifts`, `scheduling_cost_models`.
- **Role-less write handlers: 18 needed gates, not 23.** Five were correctly open: `notifications` POST/PATCH and all three `search/saved` writers only ever touch the caller's own rows (`.eq('user_id', auth.id)`). A role gate there would have broken normal use.

### Also found while executing

- **`scripts/smoke.mjs` was failing** on `api/track/[token]/approval` — no `requireAuth`, not allowlisted. Nobody knew because smoke was not in CI. Both fixed.
- **React 18 is deprecated in Next.js 16 and removed in Next 17** (dev-server warning; `react@18.2.0` installed). Not in the audit. Belongs with the platform-drift items.
- **Three Sentry deprecations**: `withSentryConfig` should import from `@sentry/nextjs/config`, `disableLogger` is deprecated, and an `onRouterTransitionStart` hook is missing from `instrumentation-client`.
- **`vendedor` was missing from three places, not one.** The Users screen declared a *local* `AppRole` that omitted it, and both Zod enums in `/api/admin/users` omitted it too. Fixed by deriving everything from one `APP_ROLES` array in [`app-role.ts`](../src/types/app-role.ts).

---

## 1. Re-verification before planning

### 1.1 Already fixed — drop from the backlog

| Audit item | Status |
|---|---|
| Meta Graph API pinned to expired `v20.0` in three places | **Fixed** in `24947d1`. Now one `GRAPH_VERSION = 'v25.0'` in [`whatsapp-graph.ts:40`](../src/lib/whatsapp-graph.ts). Nothing else to do. |

### 1.2 Confirmed to the digit

`1,058` tests in `67` files green · typecheck clean · lint `0` errors `148` warnings · `79` unread-DB-error warnings of which `73` in `app/api` · `68` table/function `as any` casts · `11` dead column refs in `get_order_labor_margin` (printed by `check:functions` itself) · `163` route files · `187` migrations · `75` pages · zero float money columns · README still says "151 API handlers" · `PlantaBoard.tsx` 1,182 lines, next largest real file 807 · **23 role-less write handlers in 15 files** (my scan found 26; 3 are the intentional public webhooks/portal).

### 1.3 Corrected

| Claim | Audit | Verified | Effect on plan |
|---|---|---|---|
| Tables without RLS | 11 | **12** (`deprecated_worker_fields` is the twelfth) | +1 line in 1A |
| `SECURITY DEFINER` without `search_path` | 5 | **5 — the audit was right** (`get_employee_cost_timeline`, `get_order_labor_margin`, `feed_whatsapp_to_real_costs`, `estimate_ot_hours`, `sync_purchase_ledger`). My first count of 3 came from a scanner with a fixed window that missed two long bodies. Plus **45** whose `search_path` lacks `pg_temp`. | 1D covers all 50 SECURITY DEFINER functions |
| Views bypassing RLS | 21 | **26** live (replaying `CREATE`/`DROP` in order; my first count of 20 was also low) | 1B — 23 flipped, 3 held back |
| Server "today" in UTC | 22 | **24** | 6B |
| Untested `src/lib` modules | 24 of 87 | **25 of 88** | The Meta fix added `whatsapp-graph.ts` with no test |
| API handlers | 275 | **273** | cosmetic |
| `npm audit` | 7 high / 3 moderate | 7 high / **2** moderate | 6D |
| AI-authored commits | 27% | **27% by author field, 60% by `Co-Authored-By` trailer** (376/627) | strengthens the audit's own "breadth ahead of depth" argument |

### 1.4 Findings the audit missed

These change the order of work, so they are stated with their evidence.

- **A — ~73 of 75 SQL functions are callable by `anon`.** Postgres: *"by default, execute privilege is granted to `PUBLIC` for newly created functions."* Only two functions are ever revoked in 187 migrations (`split_ot`, `catalogo_para_auditoria`). Everything else — `convert_vb_to_ot`, `receive_oc_into_lot`, `apply_capture_event`, `calculate_monthly_payroll` — keeps the default `PUBLIC` grant. The audit framed this as "five functions lack a fixed `search_path`"; the grant is the bigger half, and it has a one-statement fix.
- **B — no function anywhere ends its `search_path` with `pg_temp`.** 84 use `SET search_path = public`, 2 use `public, pg_catalog`, zero mention `pg_temp`. Postgres: *"the temporary-table schema, which is searched first by default, and is normally writable by anyone… write `pg_temp` as the last entry in `search_path`."* So even the "hardened" functions carry the documented hole.
- **C — the app has two database identities and one of them is broken.** See §2. This is the single most consequential finding and it re-sequences the whole access-gap phase.
- **D — three tables are genuinely anon-readable:** `workstations`, `shifts`, `scheduling_cost_models`, each via a live `FOR SELECT … USING (true)` policy with no `TO` clause. I initially read five; `ots` and `worker_assignments` had their permissive policies **dropped and replaced** in the next migration, so they are fine. Low sensitivity, cheap to fix, listed in 1B.
- **E — the 30 Oct 2026 Supabase change is narrower than the audit implies.** Per the changelog: existing tables *"keep their current grants and stay reachable"*; only **new** tables need an explicit `GRANT`. So this is a migration-discipline item, not a mass re-grant. It still lands inside this plan's window.

---

## 2. The decisive fact: two database identities

Everything in Phase 1 follows from this, so it is worth stating precisely.

| | Path A | Path B |
|---|---|---|
| Who | `supabaseAdmin` in API routes — **183 files** | `supabase` browser client — **19 files** |
| Key | service-role, server-only ([`server.ts:57`](../src/integrations/supabase/server.ts)) | publishable, in the client bundle ([`client.ts:19`](../src/integrations/supabase/client.ts)) |
| Postgres role | `service_role` | `anon` |
| RLS | bypassed entirely | enforced |
| `auth.uid()` | irrelevant | **always `NULL`** |

Path B's `auth.uid()` is always `NULL` because the app signs in with **NextAuth**, and the browser client never acquires a Supabase JWT. Yet `auth.uid()` appears **313 times** across the migrations, and **52 live policies target the `authenticated` role** that this app never occupies.

Four consequences, each verified:

1. **Browser reads of RLS-protected tables return zero rows, not errors.** `employees` is gated on `auth.uid() IS NOT NULL`; `employment_contracts`, `compensation_rates`, `leave_requests`, `employee_incentives`, `hr_documents`, `incentive_rules` are gated on `has_role(auth.uid(), …)` or `can_supervisor_view_employee(auth.uid(), …)`. With `auth.uid()` NULL every one evaluates false, and PostgREST answers `200 []` — not an error, so `if (error) throw` never fires and the screen just says there is nothing. This is the mechanism behind the audit's "People" cluster ("incentives cannot be awarded, certifications cannot be recorded") and its Ugly #4 ("a failed query renders as an empty table"). **Needs one live confirmation — see §12 Q-1.**

   **Where these screens actually live** (the nav moved; the data path did not). Only `/personas/consola` and `/personas/talento` are linked from [`navigation.ts`](../src/lib/navigation.ts); the other eight `/personas/*` pages are reachable by URL only. The affected components were not deleted — the two shells import them from those old route files:

   | Live tab | Component | Imported from | Reads as |
   |---|---|---|---|
   | `consola` → Equipo | `PersonasModule` | — | `/api/workers` — **service role, works** |
   | `consola` → Contratos | `ContratosContent` | `app/personas/contratos/page` | browser `employment_contracts` |
   | `consola` → Asistencia | `LicenciasContent` | `app/personas/licencias/page` | browser `leave_requests` |
   | `talento` → Certificaciones | `CertificacionesContent` | `app/personas/certificaciones/page` | browser `employee_skills` |
   | `talento` → Incentivos | `IncentivosContent` | `app/personas/incentivos/page` | browser `incentive_rules` (0 rows — useless as a test) |

   The Equipo tab is the built-in control: same screen, same session, but it reads through an API route. If it populates while Contratos stays empty, the difference is the data path and nothing else.
2. **The genuine data leak is the views, not the tables.** Supabase: *"Views bypass RLS by default because they are usually created with the `postgres` user."* `security_invoker` appears **zero** times in 187 migrations, so all 20 live views run as definer and are readable by `anon`. That is why the three view-backed browser reads work while the table-backed ones come back empty.
3. **The 12 RLS-off tables are open to `anon` regardless of our code.** Supabase: *"A table in an exposed schema without RLS is readable and writable by any role with a grant on it,"* and *"a new table in `public` starts with every privilege already granted to all three roles."* The audit's "server-only in our code" is true but irrelevant to an attacker holding the publishable key.
4. **Enabling RLS on those 12 is therefore safe.** All 12 are read only through Path A. Supabase: *"Once RLS is enabled, no data is accessible through the API when using a publishable key, until you create policies."* Service-role bypasses RLS, so writing **no policies at all** closes the hole and changes nothing for the app.

> **The sequencing constraint this creates.** Flipping `security_invoker = true` on the three views the browser reads — `planta_live`, `inventory_items_stock_v`, `inventory_stock_transactions_v` — would make them evaluate as `anon` and **break three working screens**. Those reads must move server-side *first*. The other 17 views can be flipped immediately.

---

## 3. Phase 0 — Prove a backup exists · ~40 min

Moved ahead of the access work. The audit put it second; it has no dependencies, it is the cheapest item in the file, and it is what makes every later migration reversible.

**0A — Take a dump.** Per the Supabase CLI reference, three dumps are needed because one command does not cover everything: the default *"does not contain any data or custom roles."*

```bash
supabase db dump --linked -f backups/2026-10-14_schema.sql
supabase db dump --linked --data-only --use-copy -f backups/2026-10-14_data.sql
supabase db dump --linked --role-only -f backups/2026-10-14_roles.sql
```

**0B — Restore it once, into a scratch project.** A dump nobody has restored is a hypothesis. Restore, then run the three check queries from the architecture review against the restored copy.

**0C — Write it down.** `docs/backup-y-restauracion.md`: the commands, where dumps go, how long they are kept, and the one-page "how to run the plant while the app is down" the July checklist still lacks.

**0D — Decide the plan.** Supabase Free has no automatic backups and pauses after a week idle. If the project is still on Free, Pro's daily backups (7-day retention) are the single highest-value purchase in this document. *Owner decision — §12 Q-2.*

**Gate:** a restored database that answers the check queries. `backups/` added to `.gitignore` — dumps contain employee personal data and must never enter a public repository.

---

## 4. Phase 1 — Close the access gaps

Six migrations plus one code sweep. Each is independently reviewable and independently revertable.

### 1A — RLS on the twelve, with no policies

`20261014120000_rls_en_las_doce_tablas_sin_candado.sql`

```sql
alter table public.clients                   enable row level security;
alter table public.dies                      enable row level security;
alter table public.ot_templates              enable row level security;
alter table public.ot_drafts                 enable row level security;
alter table public.ot_attachments            enable row level security;
alter table public.ot_approvals              enable row level security;
alter table public.purchase_items            enable row level security;
alter table public.attendance_events         enable row level security;
alter table public.certification_requirements enable row level security;
alter table public.ot_requirements           enable row level security;
alter table public.inventory_reservations     enable row level security;
alter table public.deprecated_worker_fields   enable row level security;
```

No policies, deliberately — that is the deny-by-default posture the Supabase doc describes, and all twelve are reached only through `service_role`. The migration header should say so, or someone will "fix" it later by adding a permissive policy.

**Proved by:** `smoke.mjs` green (every reader is server-side, so nothing moves), plus an anon-key read of each table returning `[]` after the push.

### 1B — Views stop bypassing RLS

`20261014121000_las_vistas_dejan_de_mirar_por_encima_de_rls.sql`

Syntax per the Supabase doc, Postgres 15+:

```sql
alter view public.<name> set (security_invoker = true);
```

Applied to the **17** views the browser does not read. Held back: `planta_live`, `inventory_items_stock_v`, `inventory_stock_transactions_v` — they move in Phase 2 and get flipped in `1B-bis` once their reads are server-side.

Same migration, finding D — the three genuinely anon-readable tables:

```sql
drop policy if exists "Authenticated users can view workstations"  on public.workstations;
drop policy if exists "Authenticated users can view shifts"        on public.shifts;
drop policy if exists "Authenticated users can view cost models"   on public.scheduling_cost_models;
```

All three are read server-side, so dropping is cleaner than re-scoping to a role this app never holds.

**First, verify the Postgres major version is ≥ 15** — `security_invoker` does not exist below it and the migration will fail loudly rather than silently. `supabase/config.toml` does not pin `major_version`, so this must be read off the live project.

### 1C — Function grants and the 30 Oct deadline

`20261014122000_las_funciones_dejan_de_ser_publicas.sql`

Finding A's one-statement fix, taken verbatim from the Supabase "Securing your API" guide:

```sql
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
```

Then the existing 73, which default privileges do not retroactively touch. Postgres' own recommended shape is revoke-then-grant in one transaction:

```sql
-- per function, generated from the catalogue, not hand-listed
revoke all on function public.<name>(<args>) from public, anon;
grant execute on function public.<name>(<args>) to service_role;  -- and authenticated only where a browser path needs it
```

Generate the list by querying `pg_proc`, do not hand-maintain it. `scripts/check-dead-function-refs.cjs` already asks the catalogue for its own answers — the same approach applies here, and a new `scripts/check-function-grants.cjs` should fail CI when a function is reachable by `anon`.

**The 30 Oct item (finding E):** existing tables keep their grants; only new ones need opting in. So the deliverable is a rule, not a sweep — every future migration that creates a table ends with its explicit grant:

```sql
grant select, insert, update, delete on table public.<new_table> to service_role;
```

Add that assertion to `check-migrations`, so a table created without a grant fails the build rather than 404-ing in production a week later.

**Do not** copy the guide's `revoke … from service_role` line. Service-role bypasses RLS but still needs table grants; revoking them breaks all 183 Path A files.

### 1D — `search_path`, including `pg_temp`

`20261014123000_search_path_termina_en_pg_temp.sql`

Findings from §1.3 and §1.4B together:

```sql
alter function public.feed_whatsapp_to_real_costs(...) set search_path = public, pg_temp;
alter function public.estimate_ot_hours(...)           set search_path = public, pg_temp;
alter function public.sync_purchase_ledger(...)        set search_path = public, pg_temp;
```

and the systemic half — the 84 functions on `SET search_path = public` get `, pg_temp` appended. Mechanical, generated from the catalogue, one migration, no behaviour change.

### 1E — Role lists on the 23 handlers, and `/api/workers`

Code, not SQL. The 23 are the ones my scan flagged minus the 3 intentional public routes:

`attachments/upload` · `employees/skills` (POST/PUT/DELETE) · `leave-requests` POST · `notifications` (POST/PATCH) · `ots/[id]/image` (POST/DELETE) · `search/saved` (POST/PATCH/DELETE) · `skills/dependencies` · `skills/proficiency-levels` (POST/DELETE) · `skills` POST · `skills/seed-crafts` · `skills/[id]` (PUT/DELETE) · `whatsapp/warehouse/logs/batch` · `whatsapp/warehouse/logs` · `whatsapp/warehouse/logs/[id]` PATCH · `whatsapp/warehouse/qr`

`requireAuth` already takes roles ([`api-middleware.ts:50`](../src/lib/api-middleware.ts#L50)), so each is a one-line change: `requireAuth(['admin','supervisor'])`. The two the audit named as mattering today go first — `whatsapp/warehouse/logs/[id]` PATCH (approves a warehouse movement into stock) and `employees/skills` (decides who may run a machine).

`/api/workers` GET replaces `select('*')` ([`route.ts:40`](../src/app/api/workers/route.ts#L40)) with a named column list. It currently returns every `employees` column to any signed-in user, including `badge_code` — the credential the clock-in kiosk accepts as identity. Narrow the columns **and** restrict the sensitive ones to HR/admin.

### 1F — Make the gap un-reopenable

`scripts/smoke.mjs` already walks `src/app/api` and asserts every route calls `requireAuth` or sits on a public allowlist ([line 122](../scripts/smoke.mjs)). Extend that check from *authentication* to *authorization*: a write handler whose `requireAuth()` carries no roles and which is not on an explicit allowlist fails.

Then **wire `smoke.mjs` into CI**, which it is not today. Its static checks (sections 1 and 2) need no running server, so they can run as a plain CI step; the golden thread stays `--mutate`-gated and local.

**Phase 1 gate:** all six standard gates, plus an anon-key probe script that asserts every table and function returns permission-denied or empty.

---

## 5. Phase 2 — The HR data path

This is finding C's repair, and the audit's "People" cluster turns out to be mostly one root cause rather than six missing features.

**2A — Confirm the diagnosis live.** Run the dev server, open the four `/personas/*` screens, and record what renders. If they are empty, §2 consequence 1 is confirmed and this phase is the fix. If they show data, something grants `anon` more than the migrations suggest, and that is a larger finding to chase first. *Thirty minutes, and it gates the rest of this phase.*

**2B — Move the reads server-side.** The nine browser-read HR tables (`employees`, `employment_contracts`, `compensation_rates`, `leave_requests`, `employee_incentives`, `hr_documents`, `leave_balances`, `employee_skills`, `user_roles`) get API routes with role gates, and the hooks call those instead of the browser client. The repo's lint rule already forbids browser-direct *writes*; this extends the same principle to reads of sensitive data, which is where it always belonged.

**2C — Move the three view reads.** `planta_live`, `inventory_items_stock_v`, `inventory_stock_transactions_v` behind API routes, then `1B-bis` flips their `security_invoker` and closes the last RLS bypass.

**2D — Then the features the audit listed.** Leave requests already have a working `POST /api/leave-requests` with no caller; `/personas/licencias` is read-only with zero mutations. Create and approve are UI work on top of an API that exists. The supervisor-save 403 (the form always sends email and phone) is a form-payload fix, not a permissions one.

**Decision to make before 2B:** moving reads server-side is the right fix, but adopting Supabase Auth instead — so `auth.uid()` becomes real and the 313 references and 52 `authenticated` policies start meaning something — is the other path. It is a much larger change and NextAuth is in security-fix-only maintenance since the Better Auth merger. *Owner decision — §12 Q-3.* My recommendation: move the reads, leave the auth stack alone, and treat the inert policies as documentation debt to be deleted rather than satisfied.

---

## 6. Phase 3 — Reconnect the dead flows

All verified broken. Each is small; the value is that the plant can finish a purchase.

| # | Fix | Where |
|---|---|---|
| 3A | "Nueva OC" sends `status: 'sent'`, API accepts only `z.literal('draft')` → every create rejected | [`PurchasesManagement.tsx:211`](../src/components/admin/PurchasesManagement.tsx#L211) vs [`purchases/route.ts:65`](../src/app/api/purchases/route.ts#L65) |
| 3B | Mount `CompraDePapelDialog` — defined, imported nowhere, and the only control that can send a reception reason. Until it mounts, partial deliveries cannot be recorded at tolerance 0 | [`CompraDePapelDialog.tsx`](../src/components/workflow/CompraDePapelDialog.tsx) |
| 3C | Let the purchasing step link a purchase order, so a "buy" line can be resolved | purchasing step |
| 3D | **Planta assignment.** `checkAssignment` rejects any production-machine shift without an `ot_id`; `setSelectedOT` is only ever called with `null` (the clear handler), so `ot_id` is always null. The selection plumbing exists on both sides and is wired to nothing on both — `onOTSelect={() => {}}` | [`assignment-rules.ts:72`](../src/lib/assignment-rules.ts#L72), [`PlantaBoard.tsx:1067`](../src/page-components/PlantaBoard.tsx#L1067), [`kanban/page.tsx:12`](../src/app/operaciones/kanban/page.tsx#L12) |
| 3E | **Client portal, one line.** `/track/` is already in `isFullscreenRoute` but missing from `isPublicRoute`, so `needsAuthRedirect` fires and bounces the client to `/login`. The page itself is correct and documents "No auth" | [`AppShell.tsx:122-131`](../src/components/AppShell.tsx#L122-L131) |
| 3F | `REPRICE_REQUIRED` clears only on `metadata.reprice_approved`, which no screen sends → an order whose price rose is stuck before paper purchase | [`transition/route.ts:177`](../src/app/api/ots/[id]/transition/route.ts#L177) |
| 3G | Add `vendedor` to the Users screen role list — the role exists throughout the API and state machine but cannot be assigned | `UserManagement.tsx` |

**Note on 3E:** no `middleware.ts` exists and none is needed. Worth recording for later route gating: in Next.js 16 the convention is **deprecated and renamed to `proxy.ts`** — *"All functionality remains the same — only the file and export names have changed"* — with codemod `npx @next/codemod@canary middleware-to-proxy .`. Any future server-side gate goes in `proxy.ts`, not `middleware.ts`.

---

## 7. Phase 4 — Make failure loud

**4A — Require `CRON_SECRET`.** [`maintenance-due-check/route.ts:49`](../src/app/api/cron/maintenance-due-check/route.ts#L49) skips its check when the variable is unset, and the comment says so. Fail closed, exactly as the WhatsApp webhooks already do when their secret is missing.

**4B — Node 22.** CI runs Node 20, end-of-life 30 Apr 2026; installed `supabase-js` 2.93.3 declares Node 22+. Bump `.github/workflows/ci.yml` to `'22'`, add `engines` to `package.json` and a `.nvmrc`. `scripts/verify-node-env.cjs` asserts `NODE_ENV`, not the Node version — extend it or add the `engines` field, which npm enforces.

**4C — One browser test, end to end.** Quote → order → purchase → reception → report → dispatch → invoice. `.mcp.json` with Playwright was just committed, so the exploration path exists; the durable artefact is a `@playwright/test` spec in CI. This is the only new dependency in the plan, and it is the test that would have caught 3A, 3D and 3E.

**4D — Alerts.** Nothing reports a failing webhook, a failed scheduled job, or a failed Vercel build; `NOTES.md` §12 records weeks of failed builds going unnoticed. Minimum viable: fail the cron endpoint loudly, add a Vercel deploy notification, and have the webhook write a row the dashboard surfaces.

---

## 8. Phase 5 — Integrity

**5A — The invoice function.** [`sales-invoices/route.ts:28-85`](../src/app/api/sales-invoices/route.ts#L28-L85) carries all three of the audit's sales findings in one place: it trusts the browser's `net_amount`, never checks whether a guide already has an `invoice_id` (so a dispatch note can be invoiced twice), and fires the guide update as a second un-transacted call **whose error is discarded**. Derive the amount server-side from the guides, reject already-invoiced guides, and move both writes into one SQL function — the repo already does exactly this for `emitir_oc` and `consumir_lote`.

**5B — Dispatch quantity** is not capped at what is outstanding. Same treatment.

**5C — The quality gate.** [`ot-state-machine.ts:332`](../src/lib/ot-state-machine.ts#L332) gates `ready_for_delivery` on a bare `hasApprovedApproval` boolean, and the dossier query filters `ot_approvals` on `ot_id` alone. The client portal's **unauthenticated** [`track/[token]/approval`](../src/app/api/track/[token]/approval/route.ts) inserts `status: 'approved'` into that same table. So an external party holding a share token satisfies an internal quality control. Add an approval kind and discriminate on it in both the gate and the dossier. **This is a security fix, not a modelling nicety — it belongs with Phase 1 if anything slips.**

**5D — Labour cost category.** [`labor-costs/route.ts:164`](../src/app/api/labor-costs/route.ts#L164) posts `category: 'impresion'`, which the ledger files as machine cost, at base rate, with the overtime premium only in the note. Give labour its own category and write the premium as a number.

**5E — Permanence.** `DELETE` handlers exist for `sales-invoices/[id]` and `dispatch-guides/[id]`; the 5-year retention rule is a function no delete endpoint calls. Block hard-deletes of issued or paid documents, and call the retention function.

**5F — One rate table.** [`whatsapp-cost-inference.ts:19`](../src/lib/whatsapp-cost-inference.ts#L19) infers "actual" cost at a flat `55000` per press hour and [`machines/economics/route.ts:22`](../src/app/api/machines/economics/route.ts#L22) repeats it, while estimates read the catalogue's per-machine 35k/55k/85k. Part of every variance is manufactured. Read the catalogue in both places. **Do not steer by variance until this and calibration are done.**

---

## 9. Phase 6 — The sloppy sweep

One afternoon, mostly mechanical.

| # | Item |
|---|---|
| 6A | `.env.example` has **zero** Supabase variables while the README says to copy it for "Supabase URL + keys". Add all five, plus the dozen other settings the code reads. |
| 6B | 24 server-side UTC "today" calculations and no timezone helper. After ~21:00 in Chile, default dates on purchases, invoices, dispatch notes and contracts land on tomorrow. Add one helper, use it everywhere. |
| 6C | README says "151 API handlers"; there are 163 route files and 273 handlers. |
| 6D | `npm audit`: 7 high, 2 moderate, all build tooling. Add Dependabot or Renovate. |
| 6E | Placeholder company identity in [`company.ts`](../src/lib/company.ts) — fake RUT, address and phone, with the file's own header saying to replace it before sending a single document to a client. **Blocks any real quote going out.** |
| 6F | 148 lint warnings: 79 unread DB errors (73 in API routes), 40 set-state-in-effect. The unread-error class is the one that renders failure as an empty table. |
| 6G | `LanguageContext` alive in 5 components of a Spanish-only app. Delete. |
| 6H | Seeds use real brand domains with invented contact names, in a public repo. |
| 6I | 68 `as any` casts of table and function names — the generated types lag the schema. `npm run gen-types` after Phase 1's migrations, then delete the casts the types now cover. |
| 6J | Hide from the menu until someone needs them: Integrations, "Predictivo", Rendimiento, incentives, the training library, saved searches, reporting snapshots, and the `identity.ts` face-recognition stub. Each is surface to secure and explain. The biometric stub is the one with legal weight — see §12 Q-4. |

---

## 9b. The unlinked pages — what to delete, and what not to

Asked for on 2026-10-14 as "plan the deletion of orphaned pages". The inventory came back differently than expected, so the plan is organised by verdict rather than as one sweep.

**70 pages; 52 are linked from [`navigation.ts`](../src/lib/navigation.ts); 18 are not.** Of those 18, **none are abandoned leftovers.** Every one is either a deliberate redirect, reachable from live in-app links, or the source of a component a live screen imports. My earlier description of them as "leftovers" was wrong.

| # | Route | Lines | Finding | Verdict |
|---|---|---|---|---|
| 1 | `/` · `/login` | — | Root and auth | **Keep** — unlinked by design |
| 2 | `/operaciones/whatsapp/operator` | 10 | Fullscreen kiosk, in `AppShell` + nav trail | **Keep** — direct-URL by design, like `/estacion` |
| 3 | `/operaciones/lotes` | 9 | `redirect()` → `inventario?tab=lots`, with a comment saying old bookmarks point here | **Keep** |
| 4 | `/operaciones/proveedores` | 14 | Redirect → `compras?tab=proveedores` | **Keep** |
| 5 | `/supply` | 10 | Redirect → `/operaciones` | **Keep** |
| 6 | `/supervisor` | 27 | Redirect → `/operaciones`, "kept for backward-compatibility" | **Keep** |
| 7 | `/equipos/lectura` | 12 | Linked from `MachineQRButton`, `MachinePendingMaintenance`, has dynamic children | **Keep** — live |
| 8 | `/equipos/mantenciones` | 12 | Linked from `equipos/lectura/[id]` | **Keep** — live |
| 9 | `/personas/capacitacion` | 18 | Linked from `PersonasModule` | **Decide** (D below) |
| 10 | `/personas/habilidades` | 28 | Linked from `PersonasModule` | **Decide** (D) |
| 11 | `/personas/empleados` | 19 | Linked from `use-global-search`, `use-quick-links`, `FragmentRow` | **Decide** (D) |
| 12 | `/personas/nomina` | 21 | Linked from `LaborCostSummary`, `FragmentRow` | **Decide** (D) |
| 13 | `/personas/contratos` | — | Exports `ContratosContent`, imported by `consola` | **Convert** (A) |
| 14 | `/personas/licencias` | — | Exports `LicenciasContent`, imported by `consola` | **Convert** (A) |
| 15 | `/personas/certificaciones` | — | Exports `CertificacionesContent`, imported by `talento` | **Convert** (A) |
| 16 | `/personas/incentivos` | — | Exports `IncentivosContent`, imported by `talento` | **Convert** (A) |
| 17 | `/calidad/retiro` | **239** | Working recall screen, in no menu, referenced nowhere | **Link it** (C) |

### A — The only real deletion: four duplicate routes (4 files)

These four are the audit's "two of everything" in its purest form: the same content reachable as a standalone route *and* as a tab, from one source file. The route is the duplicate; the component is live.

For each of `contratos`, `licencias`, `certificaciones`, `incentivos`:

1. Move the named export to `src/components/hr/<Name>Content.tsx` and repoint `consola`/`talento` at it. The shells currently import across route boundaries (`from '@/app/personas/contratos/page'`), which is why nobody noticed the route was dead.
2. Replace the page file with a redirect to the tab that replaced it — `redirect('/personas/consola?tab=contratos')` — **not** a delete. That is the house pattern, written down in items 3–6 above, and old bookmarks exist.
3. Delete the now-unused default-export page component.

**Sequence this with Phase 2B, not before it.** These four components are exactly the ones whose `anon` reads must move server-side now that Q-1 is confirmed. Extracting them in one pass and rewriting their data layer in another means touching the same four files twice.

### B — Write down why the redirects exist

Items 3–6 survive only because someone wrote a comment explaining them. `/supply` has none, and is the one most likely to be "cleaned up" by mistake. Add a line to each, and a note in the README's repository map that `/personas/*` and these stubs are redirect-only.

### C — `/calidad/retiro` is not an orphan, it is a hidden feature

239 lines of working recall functionality in no menu and linked from nowhere. The audit already flagged it ("Recall is a report only; `/calidad/retiro` is not in the menu"). Deleting it would throw away the work; add it to `navigation.ts` under Calidad, or decide the recall flow is incomplete and say so in `NOTES.md`. **Not a deletion candidate.**

### D — Four personas pages need a product decision, not cleanup

`capacitacion`, `habilidades`, `empleados`, `nomina` are reachable by clicking in the live UI — from `PersonasModule` cards, global search results and quick links. Deleting the pages means deleting those links, which removes search targets and shortcuts people may use. Two defensible options:

- **Fold into tabs**, like contratos/licencias were, and repoint every referencing link; or
- **Add to `navigation.ts`**, since they are reachable anyway and the nav is currently lying about what exists.

Doing nothing is also defensible. What is not defensible is deleting them as though they were dead.

### E — The real hollow surface is linked, not orphaned

The opposite problem, and the one worth the cleanup effort. `/analitica/rendimiento` is in the nav and reads `worker_stats`, a view over `employees` — and **nothing writes the six columns it reports**: `attendance_score`, `quality_score`, `speed_score`, `overall_rating`, `sheets_per_hour`, `teamwork_rating` are referenced by only two routes, `worker-stats` (read-only) and `workers` POST (which accepts name, department and status). So the screen renders a report of columns no code populates. Confirmed 2026-10-14; the audit had this as an unverified `[R]`.

That is 6J's list, and it is where "hide or cut" actually applies: a screen in the menu promising data that cannot exist is worse than a route nobody can reach.

### Verification for any of the above

`npx tsc --noEmit` catches a broken component import immediately — that is the main risk in A. Then `npm run lint`, `npx vitest run` (watch `nav-trail.test.ts`, which asserts on route trails), and click Equipo/Contratos/Asistencia in `consola` plus both tabs in `talento`.

---

## 10. Explicitly not in this plan

- **The AI layer.** Already planned in [`capture-local-plan-2026-10-09.md`](capture-local-plan-2026-10-09.md). Phase 1 there (store every inbound message, reply to the operator, fix the compound `FIN … INICIO` drop) is the prerequisite for any model work, and it is independent of this document. Run them in parallel if you like; they touch different files.
- **Calibration.** Needs three historical jobs from the plant, not code. The bench exists.
- **Legal e-invoicing, attendance certification, Ley 21.719 compliance.** Counsel and vendor questions, not engineering ones. The 1 Dec 2026 date stands unless the postponement bill passes. Phase 6J's biometric stub and Phase 0C's retention note are the only parts of this I can act on.
- **Machine-side sensor data.** Long-term, and the one item that also builds the sensing skills the wider project needs.
- **Breaking up `PlantaBoard.tsx`.** 1,182 lines and falling; refactoring is already under way and nothing above depends on finishing it.

---

## 11. Sequence at a glance

```
Phase 0  Backup ........................... ~40 min   · no dependencies · do it first
Phase 1  Access gaps ...................... 2-3 days  · 1A,1D,1E parallel · 1B blocked by Phase 2C · 1C before 30 Oct
Phase 2  HR data path .................... 2-3 days  · 2A gates the rest · unblocks 1B-bis
Phase 3  Dead flows ...................... 1-2 days  · 3E is one line · independent of 1 and 2
Phase 4  Loud failure .................... 1-2 days  · 4C catches 3A/3D/3E, so write it during Phase 3
Phase 5  Integrity ....................... 2-3 days  · 5C promotes to Phase 1 if anything slips
Phase 6  Sloppy sweep .................... 1 day     · 6E blocks client-facing quotes · 6I after Phase 1
```

Critical path: **0 → 1C (deadline) → 2A → 2B/2C → 1B-bis**. Everything else is parallelisable by one person.

If only one day is available: Phase 0, then 1A, then 1C's one-line default-privileges revoke, then 3E. That closes the largest holes and gives the plant a working client portal.

---

## 12. Open questions for the owner

| # | Question | Needed by |
|---|---|---|
| ~~Q-1~~ | **ANSWERED YES, 2026-10-14.** In `/personas/consola` the Equipo tab (service role, via `/api/workers`) populated while the Contratos tab (browser `anon`) was empty. After the Phase 2B fix the same tab renders **38 contracts**. The RLS/`auth.uid()` mismatch in §2 is confirmed as a live bug on four tabs. | ~~gated Phase 2~~ — closed |
| **Q-2** | Which Supabase plan is the project on? If Free, there are no automatic backups and the project pauses after a week idle. | **Phase 0D** |
| **Q-3** | Move the HR reads server-side (my recommendation), or adopt Supabase Auth so `auth.uid()` becomes real and the 313 references start working? The second is a much larger change on a dependency in security-fix-only maintenance. | **Phase 2B** |
| **Q-4** | `src/lib/identity.ts` carries a face-recognition stub. Biometric data is the sensitive category under Ley 21.719. Confirm I should **remove** it rather than leave it dormant. | **Phase 6J** |
| **Q-5** | Is the kiosk's clock-in the plant's **legal** attendance record? If so, Res. Ex. 38 (2024) requires a certified and authorised system. If not, the app should say where the legal record lives. | before any attendance work |
| **Q-6** | Phase 1C changes grants on ~73 functions. Confirm you want this as **one** migration (easier to revert, bigger blast radius) rather than several. | **Phase 1C** |

---

## 13. Working-tree state

Nothing in this document has been implemented. No files changed, no migrations written, nothing committed. The branch is `audit/captura-local-fase-1a @ 5f14a26`, clean.

Per the house rule: when a phase is approved I write the files and leave them; **the owner commits, pushes, and runs `supabase db push`**.

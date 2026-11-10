# Coherence and standards audit — 2026-11-05

Scope: the whole app (≈45 screens, 177 API routes, 197 migrations), measured
against two bars:

1. **Coherence.** The golden-thread principle: one concept, one
   implementation, so changing it in one place changes it everywhere.
2. **What a top-tier print MIS does.** Systems in the class of EFI Pace,
   PrintVis, Tharstern and Avanti Slingshot, plus ordinary engineering
   standards for a production SaaS.

Every finding below was checked in the code or the database on this date.
Findings already covered by
[audit-remediation-plan-2026-10-14.md](audit-remediation-plan-2026-10-14.md)
are referenced, not repeated.

## Status (updated 2026-11-05)

- **C-1 fixed.**
  - Stage rates come from `stageMachineRate` in `costing-resolver.ts`, the same
    resolution quotes use.
  - The server loads the quote's inputs through `rate-card.ts`.
  - The WhatsApp inference lost its private rate table.
  - Manual WhatsApp entry now runs through `processMessage` instead of a third
    pipeline.
- **C-2 fixed.**
  - `stage-valuation.ts` values every closed stage pass into `ot_cost_lines`
    (`actual` / `machine` / `ref_type='stage_pass'`), idempotently.
  - It's called by every writer of stage hours: `moveOT`, WhatsApp closes and
    late reports, and the stage-reports PATCH.
  - The WhatsApp inference no longer writes time lines.
  - Backfill: 21 passes on 5 OTs, all at catalog rates.
- **S-1 fixed (2026-11-09), without a second cloud project.**
  - Dev runs on the local Supabase stack, restored from a dump of the cloud.
  - The cloud project is staging; production gets created at go-live from
    S-2's baseline.
  - See [entorno-local.md](entorno-local.md).
- **Material double-count fixed (2026-11-10).** It was not a WhatsApp
  problem: six writers put material pesos on an OT.
  - The writers: the board dialog (which copied the quote as actual), OC
    receipt, invoice match (which never cleared the receipt line), the
    WhatsApp inference, and two unvalidated manual entries.
  - Meanwhile, paper consumed from stock never reached the OT at all.
  - Owner's rule:
    - material is costed **when consumed**, at the **actual cost of the lot
      used**;
    - the quote stays in its own lane for gap analysis;
    - lot tracking stays, and ink is consumed by kg from its lot.
  - Implementation, migration 20261110120000: one writer, a trigger on
    inventory movements against an OT, plus a guard that rejects any other
    actual-material write.
  - Receiving an OC reserves the lot for its OT, and backflush prefers that
    lot. A matched invoice re-prices the lot and every consumption from it.
    Reports and Editar e Integrar carry quantities, never material pesos.
    This also settles H3′.
  - **Machine time, same rule.** It's costed only when consumed, meaning a
    closed stage pass: hours × the quoted rate, or clicks in digital
    (stage-valuation.ts is the only writer). The same guard rejects any other
    actual machine line.
    - Removed: the seed's 2,297 "Hora de prensa" hours with no pass behind
      them, the dialog's copied quote hours (including "Operador de Prensa",
      which is labor filed as machine), and WhatsApp clicks.
  - **Seed completed so it meets the rule:**
    - the seed's press hours became stage passes;
    - the 5 OTs missing paper got lot consumptions;
    - ink got lots and per-kg consumptions for every OT that left offset;
    - OC-00021/22 lots were moved to their OT's paper.
  - Local result:
    - Material: 1,098 lot movements, $1,696M.
    - Machine: 239 passes, $185M.
    - Coverage: 224/224 paper; 221/222 ink and press time. The exception is
      40502, a QA test OT.
  - Run `scripts/value-stage-passes.mts` after the migration.

## Verdict

The **shop-floor report thread is now coherent**: one review door, one writer
(`apply_capture_event`), one mover (`moveOT`). Commit `790bea7`.

The **money side of the thread is not**:

- the same press hour has four prices;
- machine time is recorded but never becomes cost;
- two cost ledgers are held together by a one-way mirror.

So the app's headline promise — *open any order and see what it really cost* —
is not yet true for the largest cost in a print shop, press time. That is the
first thing to fix, before any new feature.

---

## 1. Coherence findings

Ranked by how much they distort what the owner sees.

### C-1 · One press hour, four prices

| Source | Offset CLP/h | Used by |
|---|---|---|
| `DEFAULT_COSTS.offset_print_per_hour` — [ot-calculations.ts:473](../src/lib/ot-calculations.ts#L473) | 25,000 | quote engine, when the catalog doesn't resolve |
| `DEFAULT_RATES.offset_per_hour` — [whatsapp-cost-inference.ts:19](../src/lib/whatsapp-cost-inference.ts#L19) | 55,000 | "actual" cost of every WhatsApp report |
| cost catalog seed `cc-42 Offset 4 Colores` — [work-category.ts:569](../src/types/work-category.ts#L569) | 85,000 | quotes resolved through `costing-resolver.ts` |
| `machines` (energy, maintenance, depreciation per machine) | derived | Equipos → Economía |

`costing-resolver.ts` was built to be the single answer, but only the
client-side quote wizards call it. The server-side WhatsApp inference ignores
it.

**Effect:** estimate-vs-actual variance (`cost_variance_snapshots`, Calibración,
Rentabilidad) compares numbers priced from different rate cards. A job that
ran exactly as quoted still shows a variance.

**Fix:** one server-side rate resolver, keyed by machine and catalog. The quote
engine, the WhatsApp inference and C-2 all read from it. The hard-coded tables
become fallbacks marked *assumed*, as `production-route.ts` already does with
`ASSUMED_RATES`.

### C-2 · Machine time never becomes cost

- `ot_stage_reports.hours` is recorded for every stage close: board, split,
  WhatsApp.
- [Migration 20260827120000](../supabase/migrations/20260827120000_la_etapa_de_taller_se_cierra_diciendo_cuanto_tomo.sql)
  says those hours, *"multiplied by the machine's rate, are the time cost that
  was missing."*
- No trigger, route or view does that multiplication. `machine_actual` in the
  ledger is only fed by WhatsApp `hrs` lines (usually 0 h; see 41221) and
  manual entries.

**Effect:** actual cost leaves out press and finishing time, so margins on
Rentabilidad are overstated by roughly that amount on every job.

**Fix:** value each closed stage pass (hours × the machine's rate from C-1)
into `ot_cost_lines` as `kind='actual'`, `category='machine'`. Do it inside the
writer that closes passes (`moveOT` / `closePass`), or with a trigger on
`ot_stage_reports`. One place, effective-dated rate.

**Then** the WhatsApp inference should stop producing its own `hrs` lines. It
currently prices time a second, different way (55,000 h with a timer that
reads 0).

> Correction to this session: the Editar e Integrar notes said hours "are
> valued separately". They are meant to be; this finding is why they aren't.

### C-3 · A fifth way to move an OT

The customer-portal approval
([track/[token]/approval/route.ts:203](../src/app/api/track/[token]/approval/route.ts#L203))
moves `visto_bueno → paper_purchase` with its own UPDATE, history row and
event.

- It calls `validateTransition` with `role: 'admin'` and
  `hasApprovedApproval: true` hard-coded.
- It passes no spec and no requirements, so those gates don't run.

**Fix:** call `moveOT` with a `cliente` actor and the real gates. If the portal
needs a narrower rule, add it to the role-transition table, not to the route.

### C-4 · Two tables plus a one-way mirror, twice

| Writers write to | Mirrored by trigger into | Readers read |
|---|---|---|
| `whatsapp_production_logs`, `whatsapp_warehouse_logs` | `capture_events` | Captures inbox, merma analytics |
| `ot_real_costs` (3 writers + `apply_capture_event`) | `ot_cost_lines` (`kind='actual'`) | Rentabilidad, cost summary |

The first pair produced this session's double-booking. The second pair
already broke once: real cost was invisible to the margin from 2026-06-28
until the 2026-08 fix (migration 20260823120000).

A mirror is a second source of truth with a delay and a mapping table
(`map_real_cost_category`). That is the "two dictionaries" problem.

**Fix (staged):** writers target the spine (`capture_events`,
`ot_cost_lines`), and the legacy tables become views. This is the deferred
"Phase 7 — table drops" from the maintenance consolidation, applied to these
two lanes.

### C-5 · Permissions are 200 literal arrays

`requireAuth([...])` appears with at least 12 distinct role sets. The most
common set is spelled three ways: `['admin','supervisor','manager']` ×42,
`['admin','manager','supervisor']` ×34, `[...OPS]` ×33.

Transitions already have a data-driven matrix (`loadRoleAccess`); route
permissions don't. Changing who can approve captures means grepping.

**Fix:** a `can(actor, action)` policy module with named actions
(`capture.review`, `ot.move`, `purchase.issue` …), seeded from the existing
arrays. Routes ask for an action, not a role list.

### C-6 · Smaller vocabulary splits

- **OT status labels:** [HojaProduccion.tsx](../src/components/workflow/HojaProduccion.tsx)
  keeps its own status-label map beside `status-labels.ts`.
- **Process vocabulary:** `PROCESS_KEYWORDS` (parser), `PROCESO_A_ETAPA`
  (flow) and `PLAN_STEPS` (route) each name the shop's processes. They agree
  today, but nothing enforces it — a test that each parser process maps to a
  plan step would.
- **Stale types:** about 90 `as any` / `as never` casts outside the report
  pipeline predate the regenerated types. `scripts/gen-types.mjs` produces
  *incomplete* types since 20261014122000 (its own header says so); use
  `npx supabase gen types typescript --linked --schema public`.

---

## 2. Engineering standards

### What is at or above standard

- Webhook HMAC verification, and wamid-based idempotency on ingest.
- Atomic `split_ot`, concurrency guards on every move, and an audit trail
  (`ot_status_history`, domain events).
- Rate limiting on mutating routes.
- Sentry plus structured logging (pino), and CI.
- Comments that say *why*. Unusually good: they made this audit possible.

### S-1 · Development runs against the production database — highest risk

`.env` points at project `sgnbbatucphbqhahgczq`, which
`supabase gen types` reports as **production**. Every dev-server request,
script and test-data fix in this session wrote to it.

That's acceptable while all data is seed data. It stops being acceptable the
day a real order is entered.

**Standard:** separate dev, staging and production projects, with seeded
staging and ideally Supabase branch databases per PR.

**Done 2026-11-09:**
- **Dev** is the local Docker stack.
- **Staging** is the current cloud project, which only ever held seed data.
- **Production** gets created at go-live.

So no second paid project is needed now ([entorno-local.md](entorno-local.md)).

### S-2 · The database can't be rebuilt from migrations

`db reset` dies at migration 20 of 196 (known since 2026-10). Recovery depends
on a dump, and S-1 can't be fixed cleanly until a fresh project can be
created from the repo.

**Fix:** a baseline migration squashed from the current schema, with the old
ones archived.

### S-3 · No end-to-end tests

There are 80 unit-test files and a smoke script, but no browser tests. The
bugs found this session (board not refreshing, card labels, a stage not
moving) are the kind only an end-to-end test catches.

**Fix:** one Playwright test that walks the golden thread against staging:
quote → OT → WhatsApp report → review → cost on Rentabilidad → card on
Tablero → dispatch.

### S-4 · Accessibility is unmeasured

There's no `jsx-a11y` lint and no axe checks. Shop-floor screens are used on
phones, in gloves, in bright light.

### S-5 · Authorization model (known)

Service role everywhere, with authorization only in `requireAuth`, and the
NextAuth vs `auth.uid()` mismatch. Tracked in the 2026-10-14 remediation plan;
C-5 is the piece of it that this audit adds.

---

## 3. Capability gaps vs a top-tier print MIS

| # | Capability | Here | Elite baseline | Note |
|---|---|---|---|---|
| G-1 | Electronic invoicing (SII DTE, Chile) | Invoice is a record; Nubox adapter waiting on credentials ([questions](nubox-facturacion-questions.md)) | DTE emitted from the job, folio stored | Legal requirement. The thread ends at "invoice", which today isn't one. |
| G-2 | Machine / prepress integration (CIP4 JDF/JMF) | None; counts come from WhatsApp | Press counters and job tickets via JMF | WhatsApp capture is a real differentiator for small shops. JDF is the upgrade path for presses that support it. |
| G-3 | OEE per machine | Not computed | Availability × performance × quality on every press | All inputs already exist: schedule, stage hours, merma, maintenance downtime. Cheapest high-value gap. |
| G-4 | Offline shop-floor station | No service worker / PWA | Station keeps working on bad Wi-Fi and syncs later | `/estacion` and `/escanear` are the candidates. |
| G-5 | Customer portal | Present (track link, V°B° approval) | Proofs, approvals, reorders, job status | On par for approvals; reorder / web-to-print absent (low priority). |

Not assessed, so no claim either way: finite-capacity scheduling depth,
estimating breadth per product type, and accounting export beyond DTE.

---

## 4. Suggested order

| When | What | Why first |
|---|---|---|
| **Now** | C-1 + C-2 together (one rate resolver, then value stage hours with it) | Makes the margin true. Everything in Analítica depends on it. |
| **Now** | S-1 staging project (needs S-2's baseline migration) | Before the first real order. |
| **Next** | C-3 portal through `moveOT`; C-5 policy module; S-3 golden-thread e2e | Closes the last side door; makes permissions changeable in one place; locks the thread with a test. |
| **Next** | G-3 OEE | Data already there; owner-visible. |
| **Later** | C-4 spine as write target (legacy tables → views); G-1 DTE when Nubox credentials arrive; G-4 offline station; G-2 JDF for capable presses | Larger migrations or external dependencies. |

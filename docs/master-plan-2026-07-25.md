# Master Plan — Consolidated from the three 2026-07-25 audits
**Date:** 2026-07-25 · **Supersedes as the working tracker:** the Personas audit, the Launch audit, and the Cross-module audit (all three folded in below).
**Goal:** one app where a won quote becomes an OT without re-typing, the plant respects maintenance, every scanned hour lands on its OT's real cost — and no write can fail silently ever again.

**Definition of done for the whole plan:** the demo script runs end to end twice, every module boundary carries data instead of forcing re-entry, and `grep` finds zero browser-direct writes outside `src/app/api`.

Sizes: **S** ≤ 2h · **M** ≈ half day · **L** 1–2 days.
Order is by dependency, not by appetite. Owner-gated rows are marked **OWNER** — house rule: nothing is committed, pushed, or deleted from the DB without explicit approval.

---

## Where the three reports agreed

All three audits, run independently, converged on the same root cause behind different symptoms: **the app has more than one door for the same job.** Two write paths (API vs browser-direct), two employee-creation paths, two machine-cost truths, three faces of the same OT checkpoint control. Every "bug" of the last two weeks — the assignment failure that nearly killed the demo, the `fdf`/`Ñaño` junk rows, the flag inconsistency — is a second door.

The plan is therefore ordered as: **close the doors, then connect the modules, then close the thread in money.**

---

## PHASE L0 — Secure the work · **OWNER**
> Nothing here is technical risk; it is existential risk. 90+ commits and the entire Personas console live on one disk.

| # | Item | Accept when | Size |
|---|------|-------------|------|
| L0.1 | Review diff, approve, commit, push | `origin` = local | S |
| L0.2 | `npx supabase db push` (3 pending migrations, incl. costing catalog resolver) | live DB matches migrations | S |

---

## PHASE L1 — Clean the demo surface

| # | Item | Where | Accept when | Size | Status |
|---|------|-------|-------------|------|--------|
| L1.1 | Remove/complete junk employee rows | DB | Personas console shows 0 "brecha de datos" | S | **DONE 2026-07-26.** `fdf`, `Ñaño` and `Pedro Bodeguero` (seed UUID `c0000000-…0001`) archived, plus `fdf`'s stale assignment removed. **20 active employees, 0 gaps**; team cost/hour now a defensible US$241,50 instead of US$459,50 inflated by `fdf`'s bogus US$213/h. Archived, not hard-deleted — the API soft-deletes, which is reversible and enough for every view |
| L1.2 | Last demo-path silent write: `scheduling_cost_models` | `PlantaBoard.tsx` ~593 | cost model saves under dev-bypass | S | — |
| L1.3 | Verify `NEXT_PUBLIC_DEV_BYPASS` off in production | Vercel | smoke green vs prod build | S | — |
| L1.4 | **OWNER** Dry-run demo script + §6.6 calibration with Guillermo | — | desvío dentro de ±10% | M | **Harness built** (`/analitica/calibracion`): Guillermo enters three historical jobs he knows the truth about — pliegos, horas de prensa, horas de terminación — and sees engine estimate vs reality with the deviation per measure and a pass/fail gate at ±10%. Writes nothing; it is a measuring instrument. Tune `CALIBRATION` in `ot-calculations.ts`, reload, watch all three move at once. **Still needs Guillermo's real numbers — that input cannot be invented** |

---

## WAVE A — Coherence · **DONE 2026-07-25**
> Cheap, visible, zero schema risk. Shipped and verified: tsc 0 · lint 0 errors · 103/103 · SMOKE GREEN.

| # | Item | Result |
|---|------|--------|
| A.1 (M1) | One `AdvanceFlags` control in all three views | new `components/workflow/AdvanceFlags.tsx`; Órdenes imports it (−86 dup lines), Hoja collapses 5 flag columns → 1 "Avance", Plan Semanal uses `readOnly size="sm"` |
| A.2 (M4) | Language contract | 37 English user-facing strings → Spanish across 7 files; established loanwords ("Checklist", "Item" labels) deliberately kept |

---

## WAVE B — One write door · **DONE 2026-07-26 (B.5 pending)**
> Merges L1.2 + M5 + U2. All three reports flagged this family; it is the class that already cost us a demo.
> Gates at completion: tsc 0 · eslint **0 errors** · 103/103 · SMOKE GREEN (7 new routes auto-discovered).

| # | Item | Result |
|---|------|--------|
| B.1 | Cost-model save through API | new `api/scheduling-cost-models`; live-tested PATCH 200, bad payload 400, values restored |
| B.2 | **M5** One door for people | `WorkersManagement` rebuilt as the real ficha over `/api/employees` (identity + contract + rate together, compensation role-gated, explicit "incomplete draft" opt-in). Also fixed the second half of the junk-row cause: the old dropdown wrote `press`/`pre_press` against a real taxonomy of `Impresión Offset`/`Pre-Prensa` |
| B.2b | **Bug found by live verification** | `POST /api/employees` inserted `hours_per_week` when the column is `base_hours_per_week`; the error was swallowed by `console.error`, so it returned **201 while creating contract-less employees**. Column fixed; partial failures now surface as `warnings` in the response and in the UI |
| B.3 | **U2** Migrate browser-direct writes | **0 remain in the UI layer.** 17 call-sites migrated across 6 files; 7 new routes: `inventory/items`, `inventory/lots`, `inventory/transactions`, `equipment-investments`, `machine-costs`, `maintenance/work-orders/[id]`, `scheduling-cost-models`. Checklists reused the existing route; `employees/skills` POST became a real upsert on `employee_skills_unique` |
| B.3b | **Invariants enforced while migrating** | lots are born at 0 and credited by a ledger transaction (the 20260710121000 single-writer rule — the old form let users type availability directly); consumption without an OT is rejected; a lot cannot be overdrawn; an item with lots cannot be deleted (traceability) |
| B.4 | **Tripwire** | ESLint `no-restricted-syntax` at **error** for `src/components`, `src/page-components`, `src/app` — verified by planting a violation and watching it fail. Selector is keyed to the browser client identifier so server-side `supabaseAdmin` is untouched |
| B.4b | **What the tripwire found that grep missed** | 16 further writes inside React-Query mutation hooks (`use-machines` 5, `use-maintenance-queries` 8, `use-employees` 2, `use-cost-overrun-alerts` 1). Staged at **warn** level in `src/hooks` — same convention this config already uses for react-hooks debt: visible and counted, not blocking. **Next slice: migrate those 16, then flip to `error`** |
| B.3c | **Hook layer cleared, tripwire flipped to `error` for all of `src`** | The 16 hook writes migrated (6 more routes: `maintenance/programs`, `.../tasks`, `.../task-logs`, `machine-supplies`, `machine-cost-entries`, `leave-requests`, plus `POST /api/notifications`). Removed the `if (isDevBypass) return` short-circuits that made those hooks *pretend* to save. Third silent bug found: the cost-overrun alert sent `type: 'cost_overrun' as any`, which is not in the `notification_type` enum — Postgres rejected every one and a bare `catch` hid it; now `system_alert`. **`src/app/api` is excluded** (it *is* the write layer, and several routes alias the server client as `supabase`) |
| B.5 | Re-point the lying FK `worker_assignments.ot_id → rosters` to `ots` | migration `20260726120000` written · **awaiting owner `db push`** — see the finding below, this is now a hard blocker for Wave C |

---

## WAVE C — Close the Golden Thread in money (U1) · **engine + route DONE, blocked on B.5**
> The differentiator. Every rail exists — `attendance_events` records clock in/out per employee *per station* from the `/estacion` QR kiosk, `compensation_rates` has the wage and the ×1.5 multiplier, `ot_real_costs` is the canonical destination with idempotent replace.

> ### ⚠️ Correction to the earlier audits — link 3 was never actually working
> All three reports listed **assignment → OT** as "welded", inferred from the column existing and PlantaBoard writing to it. Live testing during C.4 disproved that: inserting a real `ots.id` into `worker_assignments.ot_id` returns
> `violates foreign key constraint "worker_assignments_ot_id_fkey"` — because the FK targets the legacy `rosters` table. **0 of 4 existing assignments carry an `ot_id`**, and none ever could.
> So the chain has always been person → wage → machine → *(break)*. The attribution engine and posting route are complete and tested, but they will keep returning zero lines until migration `20260726120000` is applied. **This is the single highest-value thing the owner can run.**

| # | Item | Status |
|---|------|--------|
| C.1–C.3 | Attribution engine — pure, no I/O (`src/lib/labor-attribution.ts`) | **DONE.** 20 unit tests, all green. Handles forgotten clock-out (capped + flagged, never billed open-ended), machine change without clocking out, unmatched clock-out, midnight crossing, effective-dated rates, daily overtime split, a station running several OTs (even split — the kiosk records presence, not minute-by-minute job, and inventing precision would be a lie), and **refuses to invent a cost for a person with no rate** (the `fdf`/`Ñaño` case) |
| C.4 | Idempotent posting route (`/api/labor-costs`) | **DONE.** `GET ?date=` previews without writing; `POST` posts. Deterministic `LABOR-<date>-<emp>-<station>` codes under workflow step `mano_obra` make a re-run replace rather than double-charge; insert-first/delete-after, so a failed insert can never lose the day's cost |
| C.5 | "Cerrar día" in Planta | **DONE.** `components/workflow/CerrarDiaDialog.tsx` — preview-then-post: who, hours, OT, rate, cost and every warning shown *before* anything is written, because this posts real money onto real orders. Its own component rather than growing PlantaBoard (already 1 597 lines) |
| C.6 | Variance on the OT | **Already served.** `/api/ots/[id]/cost-analysis` merges budgeted operations with `ot_real_costs` and computes `overall_deviation_pct`; posted labour (step `mano_obra`) flows into it with no further work |
| C.7 | Live presence in the Personas console | **DONE.** Green/grey dot per person from `GET /api/attendance/clock`, refreshed each minute — the kiosk's floor signal surfaced where staffing decisions get made |

**Wave C is code-complete.** Every piece is built, typechecked and tested; the chain is inert only because `worker_assignments.ot_id` still cannot hold an OT. Apply migration `20260726120000` and the thread closes end to end: QR scan → hours → wage → OT cost → variance.

---

## WAVE D — Connect the remaining modules · **prepared 2026-07-26, ready to build**
> The seams the cross-module audit found cut or duplicated. Scope re-verified against the schema before starting; one of the three turned out not to be a gap at all.

> ### ⚠️ Second correction to the cross-module audit — D.3 already exists
> M8 claimed there was no quote→OT conversion. Wrong: the quote entity in this codebase is **`vistos_buenos`**, not a table called `quotes`/`cotizaciones`, and I searched for the wrong noun. `POST /api/vistos-buenos/[id]/convert` calls the `convert_vb_to_ot` RPC, freezes the estimate into the cost ledger, is **idempotent**, and already has a "Convertir" button in `/comercial/cotizaciones`. **Nothing to build.** Wave D is two items, not three.

**D.1 — Maintenance rules the plant (M2 + M6) · L**
Everything needed for the join exists; nothing consumes it.
- `workstations.machine_id` → `machines.id` is the link between a machine and its floor position.
- `maintenance_work_orders` carries `machine_id`, `status`, `started_at`, `completed_at`, `total_time_minutes`.
- `machine_downtime_logs` (`machine_id`, `reason`, `start_time`, `end_time`, `duration_hours`, `impact_description`) — **still zero readers and zero writers in all of `src`.** It is the raw material for availability/OEE.

Steps:
1. `GET /api/maintenance/work-orders?status=in_progress` → set of machine ids currently down.
2. `WorkstationLayout`: stations whose `machine_id` is in that set render an "en mantención" band, refuse drops with a Spanish explanation, and are skipped by auto-fill.
3. The work-order routes (already built in Wave B) open a `machine_downtime_logs` row on start and close it on completion — capture from the act, no extra form, same philosophy as the QR clock.
4. Availability per machine surfaces in Analítica/Máquinas from that table.
Accept when: a machine with an open work order cannot receive operators, and closing the order restores it and writes a downtime row with a real duration.

**D.2 — The machine sets its own rate (M3) · M**
Two truths that never meet:
- `machines` holds `energy_cost_per_hr`, `maintenance_cost_monthly`, `depreciation_monthly`, `power_kw`, `nominal_speed_sheets_hr`.
- The costing catalog holds `offset_print_per_hour` (engine fallback $55.000/h), resolved by `catalog_key`.

Steps:
1. Pure helper `machineHourlyCost(machine, monthlyHours)` = energy + (maintenance + depreciation) ÷ hours — unit-tested like the attribution engine.
2. Machine profile shows both with the drift: *"catálogo $55.000 · real calculado $61.200 · +11%"*.
3. The costing resolver optionally prefers the derived rate when the machine has complete economics, falling back to the catalog otherwise.
Accept when: the quote for a job on a specific press reflects what that press actually costs, and the drift is visible rather than silent.

---

## WAVE E — Structure
| # | Item | Accept when | Size |
|---|------|-------------|------|
| E.1 | **M7** Decompose the monoliths (PlantaBoard 1 597, CraftSkillTree 1 542, ProductionOTForm 1 257); logic into pure `lib/` | no demo-path component > 600 lines | L |
| E.2 | Pagination/virtualization on admin lists that can grow | large lists stay responsive | M |

---

## Gates — every wave, no exceptions
`npx tsc --noEmit` → 0 · `npx eslint src` → 0 errors · `npx vitest run` → all green · `node scripts/smoke.mjs` → SMOKE GREEN · screenshot of every screen touched · nothing committed without owner approval.

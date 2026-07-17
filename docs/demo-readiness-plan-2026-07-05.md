# Demo-Readiness Plan — from Audit to Showable App
**Date:** 2026-07-05 · **Source:** full 3-team audit (108 findings, all verified live on localhost:3000)
**Goal:** one order flows VB → OT → OC → lote → costos → dossier → despacho → factura → track, end to end, in the UI, without touching SQL — and the app looks like one product while doing it.

**Definition of "showable":** the Golden-Thread Demo Script (bottom of this doc) runs start to finish on a fresh demo seed, twice in a row, with zero 500s and zero manual DB intervention.

Sizes: **S** ≤ 2h · **M** ≈ half day · **L** 1–2 days.
Order matters: phases 1→3 are strictly sequential; 4–5 can interleave; 6 is a parallel track.

---

## PHASE 1 — Stop the bleeding (data integrity + hard 500s)
> **STATUS 2026-07-11: DONE AND FULLY VERIFIED IN DB.** All ten items live-verified (typecheck clean, 65/65 tests). Migrations `20260710120000/121000/122000` pushed by owner: VB-00003 converted end-to-end → **OT-40501** (correlative ✓, colors `2/0` normalized to `2_color/sin_impresion` ✓, idempotent ✓); fresh OC receipt lands at exactly received qty (no doubling ✓). A third migration was needed on the fly: the VB form stores colors as digit strings, converter now normalizes them. Phase 4.3 (i18n removal) pulled forward, done. Test artifacts awaiting the 3.1 purge: OT-AUDIT-9001, OT-TEST-P1, orphan lot AUDIT-LOT-777 (skipped by repair because its OC was deleted → purchase_id null), lot TEST-FIX-12 + its OC.
*Everything here corrupts data or hard-crashes on every use. Nothing else is worth doing until this lands, because demo prep itself will load data through these paths.*

| # | Fix | Where | How | Accept when | Size |
|---|-----|-------|-----|-------------|------|
| 1.1 | VB→OT converter 500 (enum casts) | new migration fixing `convert_vb_to_ot` (from `20260628150000_convert_vb_to_ot.sql`) | cast `v_vb.product_type::public.ot_product_type` (and audit `substrate_type`, `color_front/back`, `priority_level` for the same miss) | `POST /api/vistos-buenos/{signed}/convert` → 200 with `ot_id`; VB-00003 converts in the UI | S |
| 1.2 | Inventory doubles on OC receipt | migration replacing `receive_oc_into_lot` (`20260629160000_oc_goods_receipt.sql`) | insert the lot with `quantity_available = 0` and let trigger `trg_sync_inventory_lot_quantities` (from the stock tx) be the single writer; **plus a repair script**: recompute `quantity_available` on existing lots from their transactions | receive 100 → lot shows 100; existing lots corrected | M |
| 1.3 | Received OC is deletable → orphan lots | `src/app/api/purchases/[id]/route.ts` DELETE | refuse (409, Spanish message) when `inventory_lots.purchase_id` or invoices reference the OC; offer `status='cancelled'` instead | DELETE received OC → 409; draft OC still deletable | S |
| 1.4 | PATCH status side door | `src/app/api/ots/[id]/route.ts` | remove `status` from `UpdateOTSchema` — all status changes go through `/transition`. In the transition route, set `completed_at` when `to_status='completed'` (and null it on rollback out of completed) | PATCH `{status}` → 400; transition to completed stamps `completed_at` | S |
| 1.5 | priority_level never maps (urgente = 1) | `src/app/api/ots/route.ts` | drop `.default(1)` from `priority` so `priorityMap[priority_level]` fires | POST with `priority_level:"urgente"`, no `priority` → row has `priority=10` | S |
| 1.6 | `digital_printing` invisible in active lists | `src/app/api/ots/route.ts` + `src/hooks/use-workflow-queries.ts` | derive ONE exported `ACTIVE_OT_STATUSES` from `OTStatusSchema.options` (all minus `completed`); import in both places | OT in `digital_printing` appears in `?active=true` and kanban | S |
| 1.7 | `/api/employees` 500 (schema drift) | `src/app/api/employees/route.ts` lines ~117/142 | select `base_hours_per_week` (alias if the UI expects the old name) | GET `/api/employees` → 200; Personas/Empleados renders | S |
| 1.8 | Dev-bypass nil UUID breaks every `*_by` FK insert | `src/lib/api-middleware.ts` | dev bypass resolves a real user id: `DEV_BYPASS_USER_ID` env (use the existing admin `a899febc-…`), fallback to first admin in `user_roles`; keep nil UUID only as last resort | `POST /api/ots/{id}/real-costs` → 201 under dev bypass | S |
| 1.9 | Real-costs replace loses data on failure | `src/app/api/ots/[id]/real-costs/route.ts` | make replace atomic: single RPC, or insert-new-then-delete-old keyed by batch id | forced insert failure leaves previous costs intact | M |
| 1.10 | Duplicate OT number = opaque 500 | `src/app/api/ots/route.ts` POST | detect PG `23505` → 409 `"El número de OT ya existe"` | duplicate create → 409 with Spanish message | S |

**Milestone M1:** no endpoint 500s under normal use; stock, status, and costs stop corrupting.

---

## PHASE 2 — Reconnect the golden thread
*The pipeline exists module by module; these are the missing wires between modules.*

> **STATUS 2026-07-12: DONE AND FULLY VERIFIED IN DB.** All eight items live-verified after `db push` (tsc clean, 98/98 tests, lint 0 errors): single correlative numbering — now **bare digits** per owner decision (`generate_ot_number()` → `40502`; existing `OT-4xxxx` rows stripped; lookups tolerate both); wizard machine persists; **OC receipt → real cost verified: receiving 500 kg moved `total_actual` 0 → 725.000 with auto line `oc_receipt`, lot at exactly 500 (no doubling)**; dossier shows the received lot (source `recepcion`) + WhatsApp photo evidence — only "Sin aprobación" remains, which is correct; certifications = recall universe; simulator round-trip incl. the founding compound message → END+START. Operator hints teach the short form ("INICIO 40502"). Purge list for 3.1: OT-AUDIT-9001, OT-TEST-P1/P2, lots AUDIT-LOT-777 / TEST-FIX-12 / TEST-COST-01 (+ their OCs 12/13), simulator logs on 40500/40501, junk lot "2".

| # | Fix | Where | How | Accept when | Size |
|---|-----|-------|-----|-------------|------|
| 2.1 | One OT numbering scheme (plant correlative `OT-4XXXX`) | `src/app/api/ots/generate-number/route.ts` | replace with the converter's correlative logic (`MAX(substring(ot_number from 4)::bigint)+1` over `^OT-[0-9]+$`) — single generator used by wizard AND converter | wizard mints `OT-40502`-style; WhatsApp parser extracts it correctly ("fin ot 40502") | S |
| 2.2 | Wizard machine choice silently dropped | `src/app/api/ots/route.ts` | add `assigned_machine_id: z.string().uuid().nullable().optional()` to `CreateOTSchema` + include in INSERT | wizard-created OT returns `machine` populated; planta board shows it | S |
| 2.3 | OC receipt → OT actual cost (flagship wire) | `receive_oc_into_lot` or post-RPC in `src/app/api/purchases/[id]/receive/route.ts` | when `purchases.ot_id` is set, insert `ot_real_costs` row (category `materiales`, step `paper_purchase`, qty/unit_cost from the receipt) | receive OC against OT → `cost-analysis.total_actual > 0` | M |
| 2.4 | Dossier blind to received lots | `src/app/api/ots/[id]/dossier/route.ts` | join lots via `inventory_lots.purchase_id → purchases.ot_id` as "insumos trazados (recepción)"; keep consumption as a separate stronger tier | dossier lists the received cert lot; compliance reason disappears | M |
| 2.5 | Certifications page reads the wrong lot universe | `src/app/api/certifications/route.ts` | same source as recall: all `inventory_lots` with cert fields; `is_certification_required` becomes a filter/dimension, not an existence condition | received PEFC lot shows; summary buckets non-zero | S |
| 2.6 | WhatsApp is undemoable (webhook 401, no simulator) | extract webhook pipeline into `src/lib/whatsapp-ingest.ts`; new `src/app/api/whatsapp/simulate/route.ts` (requireAuth admin/supervisor + dev/demo flag); "Simular mensaje" panel on the supervisor WhatsApp page | type founder message in UI → parsed log lands in review queue → approve → costs recorded | L |
| 2.7 | Parser: "entro" + compound messages | `src/types/whatsapp-production.ts` (keywords), `src/lib/whatsapp-parser.ts` + tests in `src/lib/__tests__` | add START kws (`entro, entra, sigo, retomo, cambio a`); return `events[]` — split when an END segment is followed by a START keyword + second OT number | `"Fin OT 40879, 7600 pliegos, entro OT 40965"` → END(40879, 7600 pliegos) + START(40965); unit tests green | L |
| 2.8 | WhatsApp media → evidence **(DECIDED: in demo scope)** | `WebhookSchema` + ingest lib + simulator (2.6 must support attaching an image) | accept Twilio `NumMedia`/`MediaUrl0`, stash URL in log metadata, attach to OT on approval | photo message → attachment on the OT, visible in dossier | M |

**Milestone M2:** golden thread runs end to end through the UI (with the simulator standing in for Twilio).

---

## PHASE 3 — Demo data & analytics light-up
*The app must look alive and truthful on demo day.*

> **STATUS 2026-07-13: DONE AND VERIFIED IN DB.** Purge applied (0 test artifacts, dollar OCs gone, Mirror Test gone, zombie sessions 57→0 via view redefinition); backfill lit cycle analytics (81 completed, ~21-day lead time, 12 stages); confidence 1→84. Demo seed `scripts/seed-demo.sql` ran: VB-09001 signed (convert live on stage), OT 40502 in press (active session + pending review + auto cost $2,975M vs $4,085M est), OT 40503 completed with **COMPLIANT dossier**, GD-09001 + FV-09001 paid. Re-run the seed each demo morning + 30-second photo post-step (documented in the script header).

| # | Fix | How | Accept when | Size |
|---|-----|-----|-------------|------|
| 3.1 | Purge poisoned seeds | one repair script: delete dollar-scale OCs (OC-00001..05), "Mirror Test" captures, 2025-dated shifts + schedule rows, audit leftovers (`OT-AUDIT-9001`, lot `AUDIT-LOT-777` + its 2 stock txs) | compras/analytics totals are all CLP-scale; no 2025 rows in programa | M |
| 3.2 | Backfill `completed_at` + `ot_status_history` for the 81 completed OTs | synthesize plausible timelines between `created_at` and `deadline` | `cycle-analytics` returns stage stats, bottleneck, lead times; Analítica pages show real curves | M |
| 3.3 | Kill the 57 zombie sessions + auto-expiry | close sessions open >12h (repair + ongoing rule at read or cron); "cerrar sesión" action in supervisor UI | `whatsapp/summary.active_sessions` ≈ reality | M |
| 3.4 | `avg_confidence` scale bug | `src/app/api/whatsapp/summary/route.ts` — emit 0–100 consistently | summary shows e.g. `72`, not `1` | S |
| 3.5 | **Demo seed: one coherent client story** | `scripts/seed-demo.sql` with dates relative to `now()`: VB signed → converted OT in press → OC received w/ certified lot → pending WhatsApp reviews → dispatch + invoice for a sister OT | Golden-Thread Script runs on a fresh seed | L |
| 3.6 | Belt-and-braces `completed_at` trigger | DB trigger stamps it on status→completed | direct SQL status flips can't desync analytics again | S |

**Milestone M3:** dashboards, vitals, and analytics all show believable, current numbers on the demo seed.

---

## PHASE 4 — Prune the fluff
*Fewer, truer surfaces. Each removal is a diff that deletes code — cheap and satisfying.*

> **STATUS 2026-07-17: DONE (code).** Two evidence-driven plan corrections: (1) **Órdenes en Proceso KEPT** — it's the daily planning table (ORD/PRO/VBP/PLN/PAP flag pills + proceso_actual inline editing), not kanban-redundant; its nav description now says so. (2) **Archivo OT was the real fluff** — OTRetrievalSystem ran on a hardcoded SAMPLE_OTS array with invented statuses; deleted (2 routes + component + tile). Also deleted: Floor Mode (page/tile/AppShell ref), the legacy jobs stack (5 supervisor components + /api/jobs + useJobs — WorkerCard kept, consumed by analitica/rendimiento), /api/ot-drafts + hook, /api/reports/export. Honeycomb compacted (ellipse 218/178→160/150; 5+-ring kept wide to avoid collisions) — **owner eyeball pending on /operaciones**. Templates seed migration `20260716120000` — **pending db push**. Gates: tsc 0, 98/98 tests, lint 0 errors, kept routes 200 / deleted routes 404. (Ops note: an orphaned dev-server process was holding port 3000 with a stale cache; killed + clean restart.)

| # | Action | Notes | Size |
|---|--------|-------|------|
| 4.1 | **Floor Mode: DELETE** *(decided 2026-07-05)* | remove `/operaciones/floor` route + its nav tile; a TV mode can return post-launch built on real statuses | S |
| 4.2 | Merge OT views: `ordenes-en-proceso` + `production/retrieval` → kanban filters | Keep: **Kanban** (manage), **Planta** (schedule), **Hoja de Producción** (document/detail). Delete merged routes + components | L |
| 4.3 | **Remove i18n stack** *(decided 2026-07-05, per J-16: Spanish native)* | drop i18next deps, `src/i18n/`, settings language toggle; inline PlantaBoard strings | M |
| 4.4 | Dead features: seed 2–3 real OT templates (caja plegadiza, etiqueta vino, volante) so the selector isn't empty; fix or remove `reports/export` CSV; remove `jobs`/`ot-drafts` if truly unused | templates actually help the demo — prefer seeding over deleting | M |
| 4.5 | Delete legacy numbering code path (post 2.1) | | S |

---

## PHASE 5 — Coherence & polish (the "beautiful" pass)

| # | Action | Where | Size |
|---|--------|-------|------|
| 5.1 | One status→label→color source | refactor `OTHoverCard`, `OrdenesEnProceso`, `ExecutiveOverview` onto `src/lib/status-labels.ts`; grep-guard in CI | M |
| 5.2 | Error contract | tiny `apiError(code, mensajeEs)` helper; sweep golden-thread routes first; UI never renders raw `error.message` | M |
| 5.3 | Money: `formatCLP` everywhere; "—" instead of `-100%` when no actuals | cost-analysis consumers + shared formatter | M |
| 5.4 | Light-mode contrast pass on translucent badges (StatusBadge etc.) | add light variants alongside dark-tuned classes | M |
| 5.5 | Public tracker: dedicated `share_token` (random, revocable) + pretty Spanish timeline page | migration + `/track/[token]` page redesign — this is the customer-facing jewel | L |
| 5.6 | Wizard: completeness checklist on Summary (warn on missing deadline/substrate/machine, header-vs-operations price mismatch); prompt before restoring stale drafts | `UnifiedOTWizard.tsx`, `UnifiedStepSummary.tsx` | M |
| 5.7 | IVA on wizard summary + VB PDF (Neto / IVA 19% / Total) | `computeOTPricing` consumers, `ot-quote-pdf.ts` | M |
| 5.8 | Notification sanity for demo: only notify on `ready_for_delivery`/`completed` transitions (digest later) | transition route | S |
| 5.9 | Naming sweep: "Órdenes" accents, Inicio/Home, module subtitle consistency | nav + pages | S |

**Milestone M4:** demo dry-run passes; app reads as one product in both themes.

---

## PHASE 6 — Quote-engine credibility (parallel track with the offset team)
*Not demo-blocking (demo uses seeded quotes) but sales-blocking. Run alongside phases 4–5.*

1. Pass `machineSpeedSheetsHr` + press bodies from wizard machine step into `computeOTCalculations`; model passes = pass-through-press, not per-color (fixes 4× hour overestimate). **M**
2. Add labor (`mano_de_obra`) + overhead (8%) lines from the existing catalog to `generateDefaultOperations`. **M**
3. Stable `catalog_key` matching in `costing-resolver.ts` (kill exact-name fragility); UI shows which rates are catalog vs fallback. **M**
4. Make-ready time + per-process waste (setup sheets per color, die-setup sheets); per-finish hour formulas (troquelado ≠ barniz). **L**
5. Multi-format parent sheets (77×110, 64×88, 50×70) + gripper margin; unify bleed between `posesPerSheet` and `computeImposition`. **L**
6. **Calibration gate:** ±10% vs 3 historical jobs selected by the plant supervisor. Engine v2 doesn't merge until it passes. **M**

---

## PHASE 7 — Verify & lock

1. **CI smoke test** (`npm run test:smoke`): boot server, GET every endpoint (expect 200 + JSON shape), run the golden thread via API (create → transition → OC → receive → costs → dossier). Fails the build on any 500. This audit found `/api/employees` had been dead for weeks — never again. **M**
2. **Demo dry-run** twice on fresh seed, timed (~10 min), by someone who didn't build it. **S**
3. Security pass before exposing beyond localhost: track tokens (5.5), service-role stance documented (RLS is not the enforcement layer; `requireAuth` is — write it down and test it), webhook secrets set. **M**

---

## Golden-Thread Demo Script (the acceptance test for everything above)

1. **Comercial** — vendedor creates VB for "Viña Demo", signs it → **Convertir** → `OT-40xxx` appears (2.1, 1.1).
2. **Operaciones/Kanban** — OT visible; assign machine (2.2 persists it); transition with skipped-stage confirmation.
3. **Compras** — create OC against the OT; receive with lot + PEFC cert → stock correct, not doubled (1.2); OT actual costs show the material (2.3).
4. **WhatsApp simulator** — `inicio ot 40xxx`, then `Fin OT 40xxx, 7600 pliegos, 40 merma, entro OT 40yyy` → both events parsed (2.7); supervisor approves → costs recorded (1.8).
5. **Calidad** — dossier shows lot + cert + photo (2.4); recall drill finds lot → OC → OT → client in seconds.
6. **Despacho + factura** — guide, invoice, then the **público track link** (5.5) on a phone.
7. **Analítica** — cost vs estimate on this OT, lead times and bottlenecks plant-wide (3.2), margins in CLP.

---

## Suggested schedule (single dev + AI pair)

| Week | Content | Milestone |
|------|---------|-----------|
| 1 (d1–2) | Phase 1 complete | **M1** nothing bleeds |
| 1 (d3–5) | Phase 2 (2.1–2.7) | **M2** golden thread |
| 2 (d6–8) | Phase 3 | **M3** analytics alive |
| 2 (d9–10) | Phase 4 | fluff gone |
| 3 (d11–13) | Phase 5 + Phase 7.1 | **M4** dry-run passes |
| 3+ | Phase 6 parallel/after | engine calibrated |

## Decision log (owner's calls, 2026-07-05)
- **4.1** Floor Mode: **DELETE**. ✔
- **4.3** i18n: **remove entirely**. ✔
- **2.8** WhatsApp media: **in demo scope** (Phase 2 proper, simulator must support image attach). ✔
- **7.3** Security stance: see below — the architecture is a *hybrid*, and the demo-scope action is an RLS/API parity audit, not a rewrite.

### 7.3 — The security model, stated precisely (hybrid, two doors)
The app has **two doors to the database**, each protected by a different mechanism:

1. **API routes (100/101)** use `supabaseAdmin` (service-role key). This client **bypasses RLS by design**. Protection on this door = `requireAuth([roles])` in each handler + explicit row filters (`resolveSalesScope`). RLS policies are *never evaluated* here.
2. **Browser direct queries** — login seeds the browser Supabase client with a real user session (`AuthContext.signIn` → `supabase.auth.setSession`), and components like the Personas pages, `InventoryManagement`, financial analyses, and the realtime hook query Supabase **directly from the browser**. On this door **RLS is the only protection** — the API's role checks are not in that path at all.

**The risk:** the two doors must agree, and nothing currently checks that they do. Any table with a permissive SELECT policy (e.g. `USING (auth.uid() IS NOT NULL)` — "any logged-in user") is fully readable by ANY authenticated user from the browser console, even if the corresponding API route is admin-only. Example to audit first: HR/compensation tables consumed by the Personas pages via the browser client.

**Demo-scope actions (document-and-audit, no rewrite):**
- a. Inventory both doors: list every table the browser client touches (grep `integrations/supabase/client` consumers) and diff each table's RLS policy against the strictest API-route role gate for the same data. Fix mismatches **in the RLS policy** (tighten to role-based `has_role(...)` checks).
- b. Write the stance down in `docs/`: "API door = requireAuth + explicit scoping; browser door = RLS; service-role key never leaves the server."
- c. Smoke test (Phase 7.1) asserts: no route without `requireAuth`, and a canary check that a `technician` session cannot read a compensation row via the browser client path.
- **Post-launch option (not now):** migrate API routes to user-scoped clients so RLS enforces everywhere (defense in depth). Costly: 100 routes + NextAuth/Supabase token plumbing per request.

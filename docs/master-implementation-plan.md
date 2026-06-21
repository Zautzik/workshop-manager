# Master Implementation Plan — Industry 6.0 Workshop Organism

> The complete, dependency-ordered plan synthesizing the whole design dialogue:
> the organism frame, the Industry 6.0 differentiator, the role pipeline, and the
> ISO/EU food-traceability mandate — built on elite-efficient architecture.
> Companions: `organism-vital-signs.md` (diagnosis), `blueprint-industry6.md`
> (vision), `analitica-design.md` (BI). This doc governs execution.

---

## 1. Synthesis — three forces, one organism

The build is driven by three forces that must stay in balance:

1. **Internal health (Organism):** modules are organs, inter-module data flow is
   blood. Diagnosed root lesion: the **labor→cost clot** (`worker_assignments`
   dual key) + **no elimination** (Kidney). Health = clean circulation + closed
   feedback loops.
2. **The human (Industry 6.0 — the differentiator):** the human is the **heart**.
   The interface *is* their natural act (WhatsApp, QR photo, voice, badge-in);
   the loop **returns value** to them. Capture the exhaust of natural work; never
   automate the human away.
3. **External mandate (ISO 9001 / EU food-safety):** documental traceability — a
   per-OT **Expediente** (lots→OC, food-grade certs, deliverable photos+approval)
   retained **5 years**; facturas via PSP. Non-negotiable compliance gate.

Everything below serves these three without letting the "head" (Analítica)
outgrow the "circulation."

---

## 2. Architecture principles (the constitution — apply everywhere)

| Principle | Rule | Why / where |
|---|---|---|
| **Event sourcing spine** | Domain truth = append-only event tables; projections/aggregations are derived. | `ot_status_history` already proves it (→ Ciclo de OT). Generalize to `attendance_events`, `capture_events`. Traceability, analytics, and reflexes all read these. |
| **Ports & adapters** | External/pluggable concerns hide behind an interface; vendors are swappable adapters. | `IdentityResolver` (QR now, face-rec later), `PSP` (factura + payroll providers). Core never imports a vendor. |
| **Server-side aggregation** | Cross-entity math runs in a route/RPC, not the browser. | The `cycle-analytics` / `vitals` pattern. Kills the payroll N+1 (client fetching all rows to join in JS). "Never make the client do the heart's pumping." |
| **Single source of truth** | One definition per concept, consumed everywhere. | `navigation.ts` (nav + systems), `status-labels.ts`, a new **identity bridge** (kills `resolveAssignmentEmployeeId` duplication), a `chile_indicators` config. |
| **Type safety** | No `as any` where types exist; kill the dual-key anti-pattern. | Generated `types.ts`; the clot fix removes the structural cause. |
| **Graceful degradation** | Read paths degrade with empty/error states, never throw to the user. | `LaborCostSummary` is the model (vs payroll's hard throw). |
| **Defense in depth** | RLS + `requireAuth` role-gating + HMAC webhooks + supervisor gate + operator whitelist. | Login-less operators ⇒ the supervisor gate + phone/badge whitelist are the trust boundary. |
| **Verification gate** | Every step: `tsc --noEmit` 0 errors + `vitest` green before moving on. | Already the working rhythm. |
| **Migration protocol** | I author SQL; the user applies it (no outbound network). Temp-file pattern; clean `.next` after schema/route changes. | Per environment constraints. |

**UI/UX system** (reusable primitives, Spanish-only):
- Interoceptive Home (`VitalStrip`, organ-pulse `HexCell`) — built.
- Shared spine `AnalyticsFilters`; `status-labels` (label + color + flow-status).
- Catalog to standardize: `KpiStat`, `TrendChart`, `DrilldownCard`,
  `EmptyState`/`ErrorState`, `FlowDot` (flowing/stagnant/clotted everywhere).
- Zero-friction capture (kiosk, photo, voice); auditor-facing export (Expediente PDF).

---

## 3. The critical path (dependency reasoning)

```
              ┌─────────────────────────────────────────────┐
   Phase 0    │ Foundation: commit, kill the dual key,       │
  (hygiene)   │ one identity bridge, shared patterns         │
              └───────────────┬─────────────────────────────┘
                              │ unblocks circulation
              ┌───────────────▼─────────────────────────────┐
   Phase 1    │ KEYSTONE: Identity & Presence                │
  (keystone)  │ station badge-in → attendance + attribution  │
              │ + employee bridge (closes the clot)          │
              └──────┬───────────────────────┬───────────────┘
                     │                        │
        ┌────────────▼──────────┐   ┌─────────▼─────────────┐
 Phase 2│ Capture surfaces       │   │ Phase 4: Chile payroll │
        │ (QR/voice/photo) +     │   │ + HR/Accounting (needs │
        │ supervisor gate +      │   │ clot + attendance)     │
        │ return-to-worker       │   └────────────────────────┘
        └────────────────────────┘
   Phase 3 (parallel, compliance): ISO Expediente — mostly read-side on existing
            data; lot→OC migration + PSP factura. Independent of the clot.
   Phase 5: Reflexes + Vital-Signs surface + Kidney (retention) + real OEE.
```

**Why Identity & Presence is the keystone:** one organ simultaneously (a) clocks
attendance (the missing heartbeat/HRV), (b) attributes every field capture, and
(c) resolves operator→employee — which *is* the labor clot. Payroll, HR reports,
and accurate vitals all sit downstream of it. ISO traceability is the one major
track that can run **in parallel** (it traces materials, not labor).

---

## 4. Phases

### Phase 0 — Foundation hardening (1 short cycle)
**Goal:** stop building on debt; establish the spine.
- **Commit** the in-flight work (Living Home, vitals, quicklinks, honeycomb, docs).
- **One identity bridge:** replace every per-hook `resolveAssignmentEmployeeId`
  with a single source — a DB **view** `v_assignment_employee` (or a shared lib
  fn) that resolves an assignment to an employee. This is the architectural cause
  of the clot; centralizing it is the precondition to fixing it.
- **Kill remaining `as any`** where types exist; confirm `status-labels` /
  `AnalyticsFilters` as standards.
- **Verify:** tsc + vitest.
- *Needs from you:* nothing. *Migration:* read-only view (you apply).

### Phase 1 — Keystone: Identity & Presence
**Goal:** close the clot, create attendance, enable attribution — the heart’s pulse.
- **Data (migration):** `attendance_events` (employee_id, station_id, type
  clock_in|out, method qr|face|manual, at, metadata); `employees.badge_code`;
  an **operator registry/whitelist** (badge/phone → employee).
- **Architecture:** `IdentityResolver` port with a **QR adapter** (v1) and a
  **face-rec adapter** interface (stub for the existing system); shared-station
  context provider.
- **UI/UX:** a **login-less station kiosk** (fullscreen route, like
  `/operaciones/floor`): big badge-in/out, shows who’s active at the station,
  zero friction. Feeds `attendance_events` and sets the active-operator context
  for that station’s captures.
- **Effect:** `vitals` circulation/pulso turn real; Nómina + Rendimiento unblocked.
- *Needs from you:* station device model; (later) face-rec API. *Migration:* yes.

### Phase 2 — Capture surfaces (the human input layer)
**Goal:** every natural act feeds the organism; the loop returns to the worker.
- **Architecture:** generalize the proven `feed_whatsapp_to_real_costs` vessel
  into a unified **`capture_events`** pipeline (event sourcing): raw capture →
  **pending** → supervisor gate → digested into the domain (inventory tx / OT
  transition / deliverable evidence / cost).
- **Surfaces:** 📷 QR-photo → inventory/SKU movement · 🎙️ voice-note → OT
  transition · 📸 deliverable photo → evidence · 🪪 badge → attendance.
- **Supervisor console** (the validating membrane): one queue to approve/reject
  *input* captures **and** *output* deliverables (the dual gate).
- **Return-to-worker arc:** recognition / auto-incentive + next-best-action back
  via the same channel. *This is the differentiator made literal.*
- *Needs from you:* WhatsApp/voice provider confirmation. *Migration:* yes.

### Phase 3 — ISO food traceability (Expediente de OT) — parallel compliance track
**Goal:** the auditor-ready, 5-year, per-OT documental record.
- **Read-side first (no migration):** `GET /api/ots/[id]/dossier` assembling
  lots (via `inventory_stock_transactions.lot_id+work_order_id`) → certs
  (`inventory_lots`) → deliverable photos (`ot_attachments`) + approvals
  (`ot_approvals`) → process (`ot_status_history`) → customer (`clients.rut`).
- **Cert-validity immune check:** lot consumed past `certification_expires_on`
  ⇒ a **Toxina** (vital strip) that **blocks dossier sign-off**.
- **Migration:** `inventory_lots.purchase_id → purchases`; enrich `purchases`
  (supplier RUT, line items) ⇒ supply line becomes lot→OC→supplier.
- **Bidirectional trace** in Trazabilidad: backward (factura→OT→lots→OC→supplier),
  forward (lot→OTs→facturas→customers = recall).
- **Factura + guía via PSP** (adapter: LibreDTE/Nubox — folios/CAF, sign, SII).
- **5-year retention** policy (Kidney holds before release).
- *Needs from you:* PSP provider + credentials. *Migration:* yes (lot→OC).

### Phase 4 — Chile payroll & HR/Accounting (depends on Phase 1)
**Goal:** clean, statutory, exportable — the Lung’s exhale to SII/Previred.
- **Refactor:** move payroll/margin math from the client into a **server
  aggregation/RPC** (fixes the N+1; uses the Phase-0 identity bridge).
- **Statutory engine (phased):** AFP, salud (Fonasa/Isapre), impuesto único 2ª,
  gratificación, seguro cesantía, asignación familiar; topes en UF, IMM, brackets
  en UTM — from a **`chile_indicators`** config (single source of truth).
- **Exports:** LRE (Libro de Remuneraciones Electrónico) + Previred; accounting
  tax-ready packages. HR reports (salary/attendance/contracts) now accurate.
- *Needs from you:* UF/UTM/IMM + AFP/Isapre rate tables; payroll PSP if emitting.
  *Migration:* compensation/indicator fields.

### Phase 5 — Reflexes, Vital-Signs surface, Kidney (close the loop)
**Goal:** the brain acts; the body senses itself; toxins are eliminated.
- **Reflexes** (clone `useCostOverrunAlerts`): bottleneck→scheduling hint,
  low-margin→flag, cert-expiry→alert, maintenance-due→scheduling, **+
  return-to-worker recognition**.
- **Vital-Signs surface** (extend `admin/diagnostics`): full circulation map
  (vessels + patency) + toxin list + the artery-patency test.
- **Kidney:** data lifecycle/archival respecting the 5-yr ISO hold.
- **Real machine OEE** from `ot_status_history` × `assigned_machine_id` (bones
  report load) → replaces the snapshot.

---

## 5. Security & compliance model
- **Operators login-less** ⇒ trust boundary = **(a)** registered badge/phone
  whitelist + **(b)** supervisor approval gate. Unknown identity → quarantine.
- Role-gated routes (`requireAuth`), RLS as defense-in-depth, HMAC webhooks
  (fail-closed), CSP nonce via `proxy.ts`. Service-role key server-only.
- ISO: append-only event tables + immutable Expediente + 5-yr retention =
  audit-grade provenance.

## 6. What I need from you (gates)
1. Station device model (kiosk/tablet) + later the **face-rec API**.
2. **PSP** provider + API credentials (factura; payroll if emitting).
3. **UF/UTM/IMM** + AFP/Isapre rate tables for the Chile engine.
4. Apply each **migration** I author; restart dev with clean `.next` after.

## 7. Recommended execution order
**0 → 1 → (2 ∥ 3) → 4 → 5.** Start Phase 0 + the Phase-3 read-side Expediente in
parallel (Expediente needs no migration and is the compliance gate), then the
Keystone (Phase 1), which unblocks Phases 2 and 4.

## 8. Definition of done (per phase)
`tsc` 0 errors · `vitest` green · the relevant **vital turns real** on the Living
Home (circulation, agni, carga, human pulse) · the auditor/HR/accounting artifact
exports cleanly · no new `as any` · degrades gracefully on empty data.

# Status & Forward Plan — 2026-06-29

> Reconciles the two pre-seed audits ([audit-2026-06.md](./audit-2026-06.md),
> [mvp-punchlist.md](./mvp-punchlist.md)) against the work shipped during the
> seed/ledger/pipeline endeavour, so nothing falls off the radar. Companion to
> [spec-cost-ledger-and-vb.md](./spec-cost-ledger-and-vb.md).

---

## 1 · What shipped since the audits (✅ closed or largely closed)

| Audit ref | Item | Status |
|---|---|---|
| PL #23 | Clean, realistic seed dataset (~$300M/mo, correlative OTs, history) | ✅ seed_09/10 |
| PL #21 | Purge junk data (`saad`, `ffdfs`, `fdf/Press`…) | ✅ seed_09 deletes |
| PL #22 / A9 | Reconcile headcounts to one source | ✅ commit b34f504 |
| PL #15-18 / A11 | Wire Analítica (monthly revenue KPI, Tendencias axis) | 🟡 partial — KPIs + Tendencias fixed; Dashboard/Rentabilidad now read the **ledger** |
| PL #24 / A6 | App-wide "1 Issue" runtime error (CSP nonce) | ✅ fixed |
| PL #25 | `/equipos/ejecucion` hang | ✅ fixed (stable `EMPTY_FK_TASKS`) |
| PL #4 | OT production detail → DB (not localStorage) | ✅ `production_detail` JSONB |
| A-C1 | Dead-code deletion (~7.3k LOC) | ✅ cleanup branch |
| PL #3 (actuals) | One source of truth for cost — **actual** side | ✅ unified ledger `ot_cost_lines` |

**New, beyond the audit scope — the business pipeline** (the "money paths"):
VB (Cotización) → OT → **OC (P1)** → goods-receipt/lote (**W1**) → factura compra → real cost in the ledger → **Guía de despacho + Factura de venta (D1)** → pago; `vendedor` role with row-scoping (**C1.3**); unified **capture spine** `capture_events` (**Phase A done**, B/C pending).

---

## 2 · Still open (the backlog that matters)

### 2a · ★ Flagship — costing accuracy (audit's #1, the money path) — **OPEN**
The **actual** cost side is unified (ledger + procurement). The **estimate** engine is still naive and per-device:
- **#1a-1★** Ink still a flat constant `INK_KG_PER_SHEET = 0.003` ([ot-calculations.ts:33](../src/lib/ot-calculations.ts#L33)). No coverage-area × ink-density, per-channel/spot, substrate, or make-ready. (The Cotizaciones builder added a coarse light/medium/heavy factor only.)
- **#2** Print hours use a global `SHEETS_PER_HOUR = 3000` ([ot-calculations.ts:36](../src/lib/ot-calculations.ts#L36)) instead of the **selected machine's `nominal_speed_sheets_hr`**.
- **#3 / #19 / D5** No weighted-moving-average cost per SKU — **now feasible**, since P1/W1 create real purchase lots with `unit_cost` + `purchase_id`.
- **A3 / D2 / #38** Cost catalog still in `localStorage` (`workshop_cost_center`, [CostCenterManager.tsx:47](../src/components/financial/CostCenterManager.tsx#L47)) — the "number we price on lives in a browser cache." Shift-rotation roster also localStorage.

### 2b · Capture cockpit (D8 / PL #34-35) — **IN PROGRESS**
`capture_events` spine Phase A landed (150 rows backfilled). Pending: **Phase B** (repoint both webhooks + approve/apply onto `capture_events`; unified "Capturas" inbox UI; promote to a Home cockpit) and **Phase C** (retire legacy `whatsapp_*_logs` + old feed fns).

### 2c · Architecture debt — **OPEN**
- **D1 / A1 / C3** Retire the 1,609-LOC `WorkflowDashboard` monolith (still mounted by [kanban](../src/app/operaciones/kanban/page.tsx), [planta](../src/app/operaciones/planta/page.tsx), [clientes](../src/app/comercial/clientes/page.tsx)); its 11 internal tabs duplicate standalone routes.
- **B2** Modo Planta → a present-on-big-screen mode of the Tablero; rename `Planta`.
- **B3** Proveedores still a stub — **now derivable** from `purchases` (supplier, RUT, OC totals). Turn the stub into a real directory.

### 2d · Personas consolidation (PL #7-13) — **OPEN**
Employee record as one-stop (profile/contact/contract/comp/status); fold Contratos + per-employee Nómina in; merge Habilidades + Capacitación + Certificaciones → "Desarrollo" (8 sections → 3).

### 2e · Equipos & misc (PL #26-30, polish) — **OPEN**
Settings façade wire-or-hide (#26); utilization 47% vs 0h (#20); machine-status one enum (#28); collapse ~10 maintenance routes → ~4 (#29); seed machine-vs-tercerización (#30); Quick OT (#5); Nómina USD→CLP (#6); i18n leaks (#14/#39); accent typos (#27/#33).

---

## 3 · Recommended sequence

1. **Finish the capture spine (Phase B + C).** Already in flight; closes D8 cockpit; don't leave two write-paths half-migrated.
2. **★ The flagship costing engine** (audit #1) — biggest remaining money-path gap, and now unblocked by real purchase lots:
   - cost catalog `localStorage` → DB (shared, feeds estimate **and** reconciles to the ledger);
   - weighted-moving-average per SKU from purchase lots (#19/D5);
   - real ink model (coverage × density, per-channel + spot, substrate, make-ready) + selected-machine speed (#1/#2) in `ot-calculations.ts`.
3. **Architecture debt** — retire `WorkflowDashboard` (D1, removes C3 duplication); Proveedores directory from `purchases` (B3); Modo Planta as display mode (B2).
4. **Personas consolidation** (#7-13) + Equipos route collapse (#29) + status enum (#28).
5. **P0/polish sweep** — Settings façade, utilization conflict, i18n, typos, Quick OT, Nómina CLP.

**Immediate next step:** finish Capture Phase B (repoint writers + Capturas inbox), then pivot to the flagship costing engine.

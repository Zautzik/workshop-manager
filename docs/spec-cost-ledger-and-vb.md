# Spec — Unified Cost Ledger (L1) + Visto Bueno → OT (C1)

> Build-ready blueprint. The ledger (L1) is the spine; the Visto Bueno (C1) is
> the first document that writes to it. Everything reconciles because every cost
> and every peso is a **ledger event**.

---

## L1 — The cost ledger

### `ot_cost_lines` (one truth per OT)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| ot_id | uuid → ots | cascade |
| kind | `cost_line_kind` | `estimate` · `committed` (OC placed) · `actual` |
| category | `cost_line_category` | `material·labor·machine·finishing·outsourced·overhead·other` |
| source | text | `vb·wizard·whatsapp·purchase·inventory·manual·system` |
| description | text | |
| quantity, unit, unit_cost | numeric/text | |
| total | numeric **generated** | `round(quantity*unit_cost)` — whole CLP |
| ref_type, ref_id | text/uuid | `oc·factura_compra·wa_log·lot·guia·operation·real_cost` |
| occurred_at | timestamptz | when the cost happened |
| recorded_by, approved_by | uuid → auth.users | capture + supervisor approval |

**`ot_cost_summary` view** = estimate vs actual vs revenue (`ots.total_price`) per OT, by category. Replaces the drift-prone `ot_financials` reads. Margin = revenue − Σ actual.

**Backfill (idempotent):** `ot_operations` → `estimate` lines; `ot_real_costs` → `actual` lines (mapping the old categories). After this migration, **every existing OT already has a ledger**.

**Repoint (code phase, non-breaking):** point `OTFinancialTracking`, `ProductionCostBreakdown`, the Rentabilidad tabs, and the monthly-cost roll-up at `ot_cost_summary`/`ot_cost_lines`. `ot_financials` table becomes write-through then retired.

### Every pipeline event becomes a ledger write
| Event | Writes |
|---|---|
| VB signed → OT | `estimate` lines (source `vb`) |
| Warehouse withdrawal (QR) | `actual·material` (qty × lot weighted cost) |
| WhatsApp prod. approved | `actual·labor` (elapsed × rate) + `actual·machine/material` |
| Outsource factura | `actual·outsourced` |
| Pre-press plates | `actual·machine` (plates) |

---

## C1 — Visto Bueno (the quote that becomes the OT)

### `vistos_buenos`
| column | type | notes |
|---|---|---|
| id, vb_number | uuid / text unique | `VB-00001` correlative |
| client_id, client_name | → clients | |
| **salesman_id** | uuid → employees | **ownership** |
| product_name, product_type, quantity | | |
| width_cm, height_cm, substrate_type, grammage_gsm | | spec = OT spec |
| color_front, color_back, pantone_colors[] | | |
| **ink_coverage** | text | light/medium/heavy or % — the cost driver (1b) |
| finishes | jsonb | |
| estimate_lines | jsonb | `[{category,description,qty,unit,unit_cost}]` |
| subtotal_cost, margin_pct, markup_pct | numeric | |
| total_price, unit_price | numeric | |
| **floor_price** | numeric | guardrail — block/ warn below this |
| rush_surcharge_pct | numeric | |
| status | `vb_status` | `draft·sent·signed·converted·rejected·expired` |
| signed_at, signed_by_name, signature_url | | client signature |
| valid_until | date | |
| ot_id | uuid → ots | set on conversion |
| pdf_url | text | attaches to OT expediente |

### The estimator (advanced estimation + pricing)
`specs + ink_coverage + quantity` →
1. **material** lines from the **cost catalog** (weighted-avg per SKU), incl. the ink-coverage model (area × load × per-channel × substrate);
2. **labor/machine** from the selected press's real speed × rate;
3. **finishing** lines;
→ `subtotal_cost`. Then pricing: `total = subtotal × (1+markup)` with a **floor-price guardrail** (can't quote below cost), optional **rush surcharge** and **volume tiers**. A live **margin slider** shows margin% as the salesman moves price.

### Convert: `convert_vb_to_ot(vb_id)` — one tap, zero re-entry
1. require `status='signed'`; if already `converted`, return existing `ot_id` (idempotent);
2. generate OT number; **INSERT `ots`** copying every spec field, `total_price`, `margin_pct`, `client_id`, `salesman_id`, `vb_id`, status `visto_bueno`;
3. **INSERT `ot_cost_lines`** (`kind='estimate'`, `source='vb'`) from `vb.estimate_lines` — the OT is born with its budget in the ledger;
4. `UPDATE vistos_buenos SET status='converted', ot_id=…`; attach VB PDF to the OT expediente.

UI: **"Aprobar y generar OT"** button → preview (*"creará OT-40501, costo estimado $X, margen Y%"*) → edit-before-confirm → done.

---

## Roles & ownership

- **New role `vendedor`** (`ALTER TYPE app_role ADD VALUE 'vendedor'`).
- `salesman_id` on `clients`, `vistos_buenos`, `ots` (inherited at conversion).
- **Scope (API filter + RLS):** `vendedor` → rows where `salesman_id = current_employee_id()`; `manager/admin` → all. Real isolation, not UI hiding.
- Role ladder: **technician** (WhatsApp input) · **vendedor** (own sales) · **supervisor** (floor) · **manager** (full ops + all sales) · **admin** (all).

### Comercial surfaces
| Role | Sees |
|---|---|
| Vendedor | *Mis Clientes* · *Cotizaciones* (VB list + builder + convert) · *Mis OT* (open, partial batches, pending factura/cobranza) |
| Manager/Admin | **Pipeline de Ventas** — every salesman's funnel VB→OT→despachada→facturada→cobrada |

---

## Build order & acceptance

| Step | Deliverable | Done when |
|---|---|---|
| **L1.1** | `ot_cost_lines` + enums + `ot_cost_summary` view + backfill (migration) | every OT shows estimate & actual from the ledger |
| **L1.2** | Repoint financial reads to the view | Estimado-vs-Real / Costos Reales / monthly roll-up read one source; numbers reconcile |
| **C1.1** | `vistos_buenos` + estimator | a salesman builds a priced VB with floor guard |
| **C1.2** | `convert_vb_to_ot` + "Aprobar y generar OT" | signed VB → prefilled OT with estimate ledger lines, zero re-entry |
| **C1.3** | `vendedor` role + `salesman_id` + API/RLS | a vendedor sees only their book; manager sees all |
| **C1.4** | Comercial UI (Mis Clientes/Cotizaciones/Mis OT; manager Pipeline) | the sales desk is usable end-to-end |

> Each step is independently shippable and **only appends to the ledger** — numbers stay reconciled the whole way.

# GonsAdmin — MVP Launch Punch List

> Companion to [audit-2026-06.md](./audit-2026-06.md). Output of the pre-demo
> readiness review. Priorities are framed for a **boss demo**:
> **P0** = don't embarrass us · **P1** = makes it sellable · **P2** = polish.
>
> Progress already shipped (branch `chore/audit-cleanup`): 7.3k LOC dead code
> removed; Modo Planta exit fixed; inventory alert strip; Compras/Proveedores
> tabs; naming aligned; technician/manager roles; Día/Tarde shift toggle +
> weekly Saturday rotation.

---

## ★ Flagship — the OT ink/cost model (expand Fix #1)

The current engine prices ink as a single constant
([ot-calculations.ts:32-33,102](../src/lib/ot-calculations.ts)):

```
INK_KG_PER_SHEET = 0.003
inkKg = totalSheets × 0.003 × (front colors + back colors)   // ignores everything that matters
```

Ink consumption has **two independent variables that this conflates**, plus three more:

| # | Driver | Why it matters | Today |
|---|---|---|---|
| 1a | **Coverage area %** | fraction of the sheet that carries ink | not modeled |
| 1b | **Ink load / density** | tone *within* the covered area — a 30% area can be a 15% tint or a 100% solid (3–5× the ink); ink film thickness / solid ink density | **not modeled** |
| 1c | **Per channel + spot** | sum CMYK (TAC can exceed 100%); Pantone/metallic/white cost ≠ $32/kg and lay down differently | only counts color *passes* |
| 1d | **Substrate factor** | uncoated/absorbent stock takes more ink film than coated | not modeled |
| 1e | **Make-ready ink** | setup ink per color, ~fixed per job | not modeled |
| 1★ | **RIP / CIP3 ingest (best)** | read real per-channel ink coverage from the artwork file we already capture via WhatsApp/QR | not modeled |

**Target model:** per channel `effective = area% × tone_factor`, then
`kg = sheets × sheet_m² × effective × ink_film_g_per_m2 × substrate_factor / 1000`,
summed over channels + make-ready; spot inks on their own priced line.
Source coverage from the RIP when available, else estimator presets
(area class × density class) per color.

**Why it's #1:** ink at 31,915 CLP/kg over million-sheet runs — a wrong density
assumption is **thousands of dollars per OT** against razor margins.

Related OT-engine fixes:
- **#2** Use the **selected machine's real speed** (`nominal_speed_sheets_hr`) for print hours, not the global `SHEETS_PER_HOUR = 3000`.
- **#3** One **source of truth for material/ink cost** (today: hardcoded `31,915` vs Centro de Costos vs inventory weighted cost).
- **#4** Persist OT production detail (montaje/finishing/machine/tapas/pliegos/admin) to **DB, not localStorage** ([UnifiedOTWizard.tsx:312](../src/components/workflow/UnifiedOTWizard.tsx)).
- **#5** "Quick OT" fast path (client + qty + category) beside the 8-step wizard.
- **#6** One currency + formatter (CLP) — Nómina currently shows USD.

---

## 🔴 P0 — Demo blockers (visible breakage / credibility)

| # | Item | Evidence |
|---|---|---|
| 24 | Kill the app-wide **"1 Issue"** Next.js runtime error | badge on Home/Calidad/Equipos/Personas/Floor |
| 25 | Fix `/equipos/ejecucion` — renders dead (hangs) | won't render headless |
| 4 | OT production detail → **DB**, not localStorage | UnifiedOTWizard.tsx:312 |
| 23 | One clean, realistic **seed dataset** (OTs, 20-person roster, shifts, history) | charts must light up |
| 21 | Purge junk data (`saad`, `ffdfs`, `fdf/Press`, `CRUNCH`, `SHIFT`) | Tablero, Rendimiento, shifts |
| 22 | Reconcile **headcounts** (23 vs 0 vs 22 vs 43) to one source | Diagnostics/Nómina/Rendimiento |
| 15-18 | Wire/seed empty Analítica (Dashboard, Rentabilidad, Tendencias, roll-ups) | "No hay datos" |
| 20 | Reconcile **47% vs 0h** utilization conflict | Home vs Carga |
| 26 | Wire top Settings actions or hide the façade | every "Config" is a placeholder |

---

## 🟠 P1 — Substance that makes it sellable

| # | Item |
|---|---|
| 1a-1★ | Real ink model (coverage area · ink load/density · per-channel+spot · substrate · make-ready · RIP ingest) |
| 2 | Selected machine's real speed → print hours |
| 3 | One source of truth for material/ink cost |
| 7 | Make the **employee record the one-stop** (profile, contact, contract, comp, status) |
| 8-10 | Personas: fold Contratos + Nómina(per-employee) into the record |
| 11-13 | Merge Habilidades + Capacitación + Certificaciones → **"Desarrollo"**; 8 sections → 3 |
| 12 | Fix Capacitación name/function (menu says "cursos"; page is a markdown wiki) |
| 34-35 | Promote **WhatsApp capture** to a Home "Capture Cockpit" (confidence + approve flow = the wow) |
| 19 | Replace "Costo Promedio" with weighted-avg-per-SKU |
| 28 | Unify machine-status vocabulary to one enum |
| 29 | Collapse ~10 Equipos maintenance routes to ~4 |
| 30 | Seed the machine-vs-tercerización comparison (a real selling feature) |

---

## 🟢 P2 — Polish & hygiene

| # | Item |
|---|---|
| 5 | "Quick OT" fast path |
| 6 | One currency/formatter (CLP) |
| 14, 39 | Finish i18n (Nómina headers English; leaks across Equipos/Analítica) |
| 27, 33 | Accent typos (búsqueda/gestión/integración); Tablero↔Kanban naming |
| 31-32 | Landing whitespace, ambiguous decorative center-hex, Home hero copy/search |
| 36 | Sign-out/help on the technician fullscreen operator view |
| 37 | Smoke tests: OT-create + costing |
| 38 | DB-migrate the two localStorage stores (cost catalog + shift-rotation roster) |
| 13 | Simplify the over-built skill tree vs the anemic employee record |

---

## Investment principle
> Over-built where it dazzles (skill tree, hex landings), under-built where it
> earns (ink model, employee record, data pipeline). Rebalance toward the money
> paths before the demo.

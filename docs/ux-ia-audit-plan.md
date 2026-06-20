# UX / Information-Architecture Audit & Upgrade Plan

> Status: **plan only — no app code changed.** Produced by navigating the running
> app (localhost:3000, dev-bypass) + mapping the navigation config against the URL tree.

## The lens applied to every screen
For each section we ask the two questions you posed:
1. **Is this the best way to deliver this function?**
2. **Is there a better way to show this information or organize these elements?**

---

## Root diagnosis (why the inconsistencies exist)

The app was **refactored from role-based URL trees** (`/workflow`, `/manager`,
`/supervisor`, `/admin`, `/financial`, `/hr`, `/maintenance`) **into five concept
modules** (Operaciones, Personas, Equipos, Analítica, Administración) — but **two
things were left half-done**:

1. **URLs were never migrated.** Routes still live in their old trees, so a section
   can sit under one module visually while its URL says another. Examples found:
   | Shown under module | Label | Actual URL |
   |---|---|---|
   | Operaciones | Inventario / Almacén | `/admin/inventory` |
   | Operaciones | Compras | `/admin/purchases` |
   | Analítica | Dashboard | `/admin/overview` |
   | Analítica | Análisis | `/manager/trabajadores` |
   | Analítica | Trazabilidad | `/manager/trazabilidad` |
   | Personas | Capacitación | `/admin/training` |
   `/manager`, `/supervisor`, `/supply` are now **redirect stubs**, but their child
   pages still exist and get linked piecemeal.

2. **Two navigation surfaces drifted apart.** The **sidebar** (`AppShell.tsx`,
   `operacionesChildren`) and the **module landing honeycomb**
   (`/workflow/page.tsx` etc.) were authored independently and now **disagree on
   labels, targets, and grouping** for the *same* module:
   | Concept | Sidebar | Landing page |
   |---|---|---|
   | Groups (Operaciones) | OTs / Planta / Abastecimiento / Comercial | Órdenes de Trabajo / Piso & Turnos / Clientes & Logística |
   | Production view | "Archivo OT" → `/workflow/production` | "Producción" → `/workflow/hoja-produccion` |
   | Warehouse | "Inventario" `/admin/inventory` **and** "Bodega" `/workflow/warehouse` | "Almacén" `/admin/inventory` |
   Also inconsistent: **only Operaciones has a sidebar submenu**; Personas, Equipos,
   Analítica, Administración have none — you must go through the landing honeycomb.

**Everything else in this document is a symptom of those two gaps.** The highest-leverage
fix is to resolve them at the root, then clean up per module.

---

## Cross-cutting decisions to settle FIRST (they drive all module work)

### D1 — Single source of truth for navigation
Create one `src/lib/navigation.ts` exporting the module → group → item tree (label,
href, icon, roles, description). **Both** the sidebar and the module-landing honeycomb
render from it. This structurally **eliminates the drift** and gives every module a
consistent submenu. *Recommended — do this before any reorganization.*

### D2 — URL strategy
Two options:
- **(A) Keep URLs, fix only the labels/grouping** (cheap, no redirects, but URLs stay
  "wrong" — `/admin/inventory` under Operaciones forever).
- **(B) Migrate URLs to match modules** (e.g. `/admin/inventory` → `/operaciones/abastecimiento/inventario`),
  with redirects from old paths. Cleaner mental model, more work, must preserve any
  bookmarked links and the `track/[token]` public route.
**Recommendation: B, phased** — migrate the clear cross-module offenders first
(inventory, purchases, overview, manager/*, training), leave intra-module URLs alone.

### D3 — Finish the Spanish-only i18n + display labels
- Convert the **two components still using broken `t()` keys** to hardcoded Spanish:
  `OrderLaborMarginAnalysis` (renders `financial.orderLaborMargin`, `common.noDataAvailable`…)
  and the other `useTranslation` consumer. *(Or add the missing keys to `es.json`.)*
- Add **Spanish display-label maps** for enums shown raw in the UI: OT status
  (`die cutting`, `offset printing`…), machine status (`idle/running/maintenance/offline`),
  worker rating (`High consistency`). These leak English into charts, badges and legends.
- Fix the **encoding/mojibake bug** on inventory (`•` → `â€¢`) — a charset issue in how
  the bullet separator is emitted.
- Remaining hardcoded English leaks to sweep: manager KPIs dashboard (almost entirely
  English), inventory card labels (`Total Inventory SKUs`, `Low-Stock Alerts`,
  `HIGH`/`CRITICAL`), Turnos "How to use:" help box.

---

## Per-module plan

### 1) Operaciones (`/workflow` + borrowed `/admin/*`)
**Current sections:** OTs (Kanban, En Proceso, Gantt, Hoja de Prod., Archivo OT),
Planta (Modo Planta, Estaciones, Turnos, Calendario, Plan Semanal, WhatsApp),
Abastecimiento (Inventario, Compras, Bodega), Comercial (Clientes).

**Issues found**
- **Planta is overloaded** (verified visually): one screen crams a horizontal
  *shift-day scroller* (the "Turno" strip), station cards grouped by machine type,
  **and** a worker roster + stats panel. Too many jobs at once; the Turno scroller is
  hard to navigate with many days.
- **"Turnos" (`/workflow/shifts`) is mislabeled** — it renders a **Machine Schedule
  Gantt** (machine utilization), not worker shifts. Function ≠ label. Meanwhile actual
  shift/roster assignment lives *inside Planta*.
- **Duplicate/triplicate warehouse concepts**: Inventario (`/admin/inventory`),
  Almacén (`/admin/inventory`, same target, different name), Bodega
  (`/workflow/warehouse`). Users can't tell these apart.
- **Sidebar vs landing mismatch** (see root diagnosis): "Archivo OT" vs "Producción",
  different group names, En Proceso/Calendario/Plan Semanal missing from the landing.
- Likely-orphaned: `/workflow/planta-integrada`, `/workflow/ordenes-en-proceso`
  (duplicates kanban?), `/workflow/calendar`, `/workflow/plan-semanal` — present in one
  nav surface or neither.

**Better-way recommendations**
- **Split Planta into two focused screens**: (a) *Vista de Piso* — stations +
  live assignment only; (b) *Turnos/Roster* — who works which shift. Replace the
  horizontal day-scroller with a single **date + shift picker** ("Hoy · Turno Día").
- **Rename the machine-schedule page** to "Programación de Máquinas" and move it under
  **OTs** (next to Gantt), since it's about machine/OT scheduling, not shifts. Reclaim
  the word "Turnos" for the actual roster.
- **Collapse warehouse to one concept.** Decide: is `/admin/inventory` (stock/SKUs) the
  same as `/workflow/warehouse` (bodega movements)? If different, name them distinctly
  ("Inventario/Stock" vs "Movimientos de Bodega"); if same, retire one.
- **Decide the fate of** `ordenes-en-proceso` vs Kanban, and `planta-integrada` vs
  `planta` — consolidate or delete duplicates.

### 2) Personas (`/hr` + borrowed `/admin/training`)
**Current sections:** Personal (Empleados → `/hr/empleados`, Asistencia → `/hr/licencias`),
Compensación & Carrera (Retribución → `/hr/nomina`, Habilidades → `/hr/habilidades`,
Capacitación → `/admin/training`).

**Issues found**
- `/hr/empleados` renders a **simpler directory** (UserManagement-style) than the
  richer `HrManagerDashboard` (tabs: compensation, leave, incentives, docs) that was
  translated — confirm which is the intended employee screen; the rich one may be
  unrouted.
- **Capacitación lives at `/admin/training`** (cross-module URL).
- Routes `/hr/certificaciones`, `/hr/contratos`, `/hr/incentivos` exist but aren't on
  the landing — verify they're reachable (sub-tabs) or orphaned.
- Leak: "**Skills**, niveles de maestría…" on the Habilidades card.

**Better-way recommendations**
- Pick **one** employee experience (directory vs full dashboard) and route to it
  consistently; expose contratos/certificaciones/incentivos as tabs within it rather
  than scattered routes.
- Move Capacitación content under `/hr/*` (D2-B) or accept the borrow (D2-A).

### 3) Equipos (`/maintenance`)
**Current sections:** Flota & Mantenimiento (Máquinas, Plan & Órdenes, Ejecución),
Análisis & Predictivo (Historial & KPIs, Alertas & Predictivo).

**Assessment:** the **cleanest module** — URLs match the tree, grouping is coherent,
`/maintenance/programa` rendered well in Spanish. Minor: several routes
(`programa`, `checklists`, `stats`, `predictive`) are consolidated under the 5 landing
tiles — verify each is reachable. Polish: missing accents (`Descripcion`, `Seccion`).
**Use this module as the template** for what "good" looks like.

### 4) Analítica (`/financial` + `/manager/*` + `/admin/overview`)
**Current sections:** Costos & Finanzas (Costos, Márgenes, Finanzas/Nómina),
KPIs & Reportes (Dashboard → `/admin/overview`, Análisis → `/manager/trabajadores`,
Trazabilidad → `/manager/trazabilidad`).

**Issues found**
- **Spans three URL trees** (`/financial`, `/manager`, `/admin/overview`) — the most
  fragmented module. `/manager` redirects to `/financial`, but `/manager/kpis`,
  `/tendencias`, `/costos`, `/actividad`, `/auditoria` still exist and aren't all linked.
- **`/manager/kpis` is almost entirely English** (Strategic KPIs, all cards, chart
  axes, legend) — a major untranslated surface.
- **`/financial/margenes` shows raw i18n keys** to the user (broken `t()`), and on empty
  data shows `common.noDataAvailable`.
- "Finanzas" pointing at **Nómina** is a narrow mapping — payroll is one slice of finance.

**Better-way recommendations**
- **Consolidate analytics into one tree** (`/analitica/*` or keep `/financial/*`),
  fold the useful `/manager/*` pages in as sections, and **delete the dead ones**.
  One coherent sub-nav: Costos · Márgenes · Nómina · KPIs · Tendencias · Trazabilidad · Auditoría.
- Fix the two i18n defects here first (most jarring to users).
- Re-evaluate whether the KPI dashboard's balanced-scorecard layout is the best default,
  or whether a focused "today's operations" view serves the manager better.

### 5) Administración (`/admin`, minus the borrowed routes)
**Current sections:** Sistema (Usuarios, Notificaciones, Config. & APIs, Diagnósticos).

**Issues found**
- The `/admin` **tree is split across three modules** — `inventory`, `purchases` →
  Operaciones; `overview` → Analítica; `training` → Personas; leaving only
  users/notifications/settings/diagnostics here.
- `/admin/suppliers`, `/admin/workers` exist but aren't on any landing — **likely
  orphaned**; verify.
- Inventory screen (surfaced in Operaciones) has the **encoding bug + English labels**.

**Better-way recommendations**
- After D2, `/admin` should hold **only system administration**. Relocate inventory/
  purchases/overview/training to their conceptual homes (or just relabel under D2-A).
- Audit suppliers/workers: route them or remove them.

---

## Suggested sequencing
1. **D1 — unify navigation into one config** (eliminates drift; low risk; high clarity).
2. **D3 — finish i18n**: fix the 2 broken `t()` screens, the encoding bug, enum display
   maps, and the manager-KPIs/inventory English. (User-visible, independent of IA.)
3. **Operaciones cleanup**: split Planta, fix the Turnos mislabel, dedupe warehouse,
   resolve orphan routes.
4. **Analítica consolidation**: one analytics tree, fold/delete `/manager/*`.
5. **D2 — URL migration** (phased) for the cross-module offenders, with redirects.
6. **Personas & Administración** tidy-up (employee screen decision, orphan routes).

Equipos is the reference standard — bring the others up to it.

## Open questions for you
- D2: migrate URLs (B) or just relabel (A)?
- Warehouse: are Inventario/Almacén/Bodega one thing or several?
- Employee screen: simple directory or full HR dashboard as the canonical `/hr/empleados`?
- "Turnos": should it mean worker rosters, machine scheduling, or both (split)?

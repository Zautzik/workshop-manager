# Fix plan: audit findings + screens that fit (2026-11-25)

Source: the audit of 2026-11-25 (Claude Doc "Workshop Manager — Full App Audit
& Launch Plan"). Status at writing: C5 (data), C7 and L6 closed; L3 built and
switched off; everything else below is open and was re-checked in code today.

Two goals, worked together:

1. **Every finding fixed on one path.** No fix may add a second source for a
   fact that already has an owner.
2. **Every screen fits.** Usable on a 390 px phone, complete on a 1280×720
   laptop, and not stretched on a 2560 px monitor.

---

## Rules every change follows

### Golden thread (data)

| Fact | Its one owner | Readers must go through |
| --- | --- | --- |
| Pass hours | `ot_stage_reports` | `stage-valuation.ts` helpers / analytics routes |
| OT moves | `moveOT` (`src/lib/ot-move.ts`) | never a direct `status` update |
| Capture review / apply | `POST /api/captures/review` → `apply_capture_event` | Capturas screen only |
| Daily plan | `/api/planificacion` (built on `ot_machine_schedule`) | Cronograma **and** Hoja de Producción |
| OT lists and totals | server routes (`/api/ots/search`, aggregate routes like `/api/analytics/resumen`) | never "fetch 200 and sum in the browser" |
| Labour cost | `labor-from-shifts.ts` at pass close | Rentabilidad, Mano de obra |
| Who has which role | the lookup used by `/api/admin/users` | Diagnósticos too |
| Input limits | one shared module `src/lib/limits.ts` | every zod schema that takes quantity / price |
| Company name, contact, brand | company settings (one row) | quote document, `/track`, emails |

A per-channel writer, a second mover, or a browser-side `supabase.from()` on a
business table is a review blocker.

### Layout (screens)

| Width | Target |
| --- | --- |
| 360–430 px (phone) | No sideways scroll, ever. One column. Tap targets ≥ 40 px. Text ≥ 12 px. |
| 768–1024 px (tablet) | Two columns where it helps; sidebar becomes a drawer. |
| 1280×720 (small laptop) | The page's main answer visible without scrolling. |
| 1440–1920 px | The design target. |
| 2560 px+ | Content capped at 1600 px and centred; extra width adds columns, never stretches cards. |

Wide boards (Cronograma Gantt, Tablero) opt out of the cap and use the full
width.

---

## Phase 0 — Layout foundation (≈ 5 d, do first)

Every later page fix uses these pieces, so they come first. Evidence from
today's measurements: content clipped past the screen edge at 390 px on
Planificación (2,563 px wide), Clientes (971), Diagnósticos (612),
Operaciones (542); hexagon menus cut off on Inicio and every module landing;
at 2560 px cards stretch to ~370 px each with no cap. In code: 76 pages each
set their own padding (27 use `p-6`, 6 use `p-6 md:p-8`), 29 fixed 3+ column
grids with no breakpoint, 45 tables with no phone layout, 17 headings at
`text-3xl`/`text-4xl`, no max content width.

| # | Piece | What it does | Replaces |
| --- | --- | --- | --- |
| F1 | `PageShell` (`src/components/layout/PageShell.tsx`) | One wrapper for all 76 pages: padding `px-4 sm:px-6 lg:px-8`, `max-w-[1600px] mx-auto` (prop `wide` for boards), title `text-xl sm:text-2xl`, subtitle, an actions slot that wraps on phone. Keeps the negative-margin contract `AnalyticsFilterBar` relies on. | Per-page padding and headers |
| F2 | `StatsBar` | One slim row of figures; hides zeros; 2 per row on phone, all in one row from `lg`. | Big KPI card grids (M5) on Mantenimiento, Compras, Despachos, Personas, Diagnósticos |
| F3 | `DataTable` responsive mode | `md+`: the table, first column sticky. Phone: each row becomes a compact card (title, two key figures, chevron). Columns declare `priority` so low-priority columns drop first on mid widths. | 45 hand-made tables, worst first: Clientes, Despachos, Compras, Certificaciones, Personas, Diagnósticos |
| F4 | `ScrollTabs` | Tab bars scroll sideways inside themselves, never the page. | Consola, Talento, Equipos, Analítica tab rows (M3) |
| F5 | Responsive grid presets | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4` and an auto-fit `minmax(18rem,1fr)` preset. | The 29 fixed grids |
| F6 | Launchers on phone | `ModuleHexLanding` and `HomeDashboard`: hexagons from `md` up; below `md`, a two-column tile list (icon + name), every group visible. One component fix covers Inicio and all 8 module landings. | Clipped hexagons |
| F7 | Density pass | Headings down one step, card padding `p-4 sm:p-5`, table rows `py-2`. No root font-size change (keeps rem-based spacing coherent). | "Too big" on phone |
| F8 | Layout guard | `scripts/qa/layout-crawl.mjs`: opens every route at 390, 1280×720, 1920 and 2560; fails on sideways overflow, content clipped past the viewport, content wider than 1600 px at 2560, or a tap target < 32 px on phone (toggles 24 px); warns on text < 12 px. `npm run qa:layout`. Run before every deploy. | Manual screenshot checks |

**Done when:** the crawl reports zero overflow and zero clipping on all routes
at all four widths, and Inicio, Operaciones, Clientes and Resumen are checked
by eye on a phone.

**Status 2026-11-25: done.** Crawl result on 57 routes: 0 failures at 390,
1280×720, 1920 and 2560 (before: 5 pages scrolling sideways at 390, launchers
cut off, no width cap). How each piece landed:

- F1: `PageShell` on 41 pages by codemod; the 1600 px cap lives in AppShell
  (`isWideRoute`), so the pages that render a component directly get it too.
  `AnalyticsFilterBar` uses `PAGE_BLEED`.
- F2: `StatsBar` (`src/components/ui/stats-bar.tsx`) on Mantenimiento ›
  Vencimientos, Compras and Despachos; Despachos' private KpiCard copy removed.
  Other KpiCard rows move when their page is upgraded in Phase 3.
- F3: `MobileCardList` built and used on Clientes. Every raw table now scrolls
  in its own box (4 wrapped; the rest already were), and `ScrollArea` gained a
  horizontal scrollbar — it used to cut wide content off. Card mode for the
  other big tables comes with their Phase 3 page work.
- F4: done in `ui/tabs.tsx` itself, so every tab row scrolls; 7 tab bars laid
  out as fixed grids went back to it.
- F5: stat and form grids stack on a phone (10 places); month calendars and
  wizard toggles keep their grids on purpose.
- F6: module launchers show a grouped tile list below `lg`; Inicio keeps its
  honeycomb, scaled to the width (`useFitScale`).
- F7: page titles `text-xl sm:text-2xl` (37), breadcrumb taps 32 px, 12 px
  text floor on phones in CSS (boards excluded via `data-board`).
- F8: `scripts/qa/layout-crawl.js`; `npm run qa:layout` (every width) and
  `npm run qa:layout:phone` (390 only, ~4 min) run it in headless Chromium
  through `@playwright/test`, exit 1 on any failure. Run from PowerShell or
  with an upper-case `C:` — Git Bash's `c:` path also loads Vitest twice.

**Closed 2026-11-27:** the ~210 small tap targets (Máquinas, Costos,
Inventario, Planta, Rentabilidad, Pre-Prensa, WhatsApp…) are 36 px on a phone
and unchanged from `sm` up (`h-9 sm:h-7`, `.tap` in `index.css`). Tap targets
are now a FAILURE in the check: < 32 px, checkboxes/switches < 24 px; a link
inside a sentence is exempt. Phone run: 0 failures. Two text-size warnings
remain (Tendencias chart axis, Talento skill tree), both drawn boards.

**Phone planning (2026-11-27):** below 768 px the Cronograma tab mounts
`plan-movil/PlanMovil` instead of the Gantt — Ahora (now/next per machine),
Carga (7-day heat map), Riesgo (late/blocked OTs) — and a stage panel
(move with landing preview, release, delay simulation, make-ready). It reads
the same `useProductionSchedule` and writes through the same
`usePlanActions` → `/api/ot-schedule`; where a moved stage lands is
`landingSlot` in `src/lib/plan-actions.ts`, shared with the Gantt drop.

---

## Phase 1 — Critical (≈ 6 d)

| # | Fix | Owner it respects | Steps | Done when |
| --- | --- | --- | --- | --- |
| C1 | Notificaciones crash | One realtime subscription | 1. `NotificationsProvider` in the shell opens `notifications-<user>` once. 2. `use-notifications` reads the context; `NotificationCenter` and `NotificationsManagement` stop subscribing. 3. Test: both mounted, no throw. | Page opens with the bell mounted |
| C2 | 200-OT cap | Server owns lists and totals | 1. `GET /api/ots/search` (paged, filters: text, status, client, date range). 2. Aggregates for Rentabilidad, Inventario, Compras, Tendencias move to server routes, like `/api/analytics/resumen`. 3. Migrate the 15 `useOTs` consumers: lists → search, sums → aggregate. 4. Expediente finds an OT from May. | No screen sums OTs in the browser |
| C3 | Hoja de Producción empty | `/api/planificacion` is the daily plan | 1. Hoja calls `/api/planificacion?date=` instead of querying `ot_machine_schedule` on its own. 2. Group by machine and shift; print layout. 3. Check whether the manual-slot writer in `OTGanttBoard` is still used; if not, remove the UI (table stays). | Hoja shows the same OTs as the Cronograma for the day |
| C4 | Invented ratings | A score exists only if someone set it | 1. `overall_rating`, `attendance_score`, `quality_score`, `speed_score`, `teamwork_rating` are only written by hand in the employee form; show "sin evaluar" when never set. 2. Remove the "Rating 82/100" card. 3. `PlantaBoard` auto-fill stops ranking on `overall_rating`; use skills and availability. 4. Add hours this month per person from the ledger. | No default value is shown as a fact |
| C5 | Quantity / price unbounded | `src/lib/limits.ts` | 1. One module with max quantity, max unit price, max total. 2. Used by vistos-buenos, OT, quote and invoice schemas. 3. Tests. | 999,999,999 is rejected everywhere |
| C6 | Carga shows 0 h | `ot_stage_reports` | 1. `/api/machines/load` sums pass hours per machine from the ledger. 2. Carga reads it; status dwell time removed. | Carga shows the 14.5 h the ledger has |

**Status 2026-11-26: code done, verified locally; one migration waiting for the
owner's OK before it goes to the cloud.**

- C1: `useNotificationsRealtime()` opens the channel once, from AppShell;
  `useNotifications()` only reads. Notificaciones opens with the bell mounted.
- C2: `useOTs()` (first 200) is deleted. `/api/ots` gains `active=true` and
  `board=true` (unpaged, via `fetchAll`) and `q=` (search over every OT).
  Screens moved to `useActiveOTs` (Pipeline, Compras, Inventario, Turnos,
  Calendario, Cotizaciones, Seguimiento financiero), `useOTSearch`
  (Expediente, Ciclo de OT, Análisis de costo, búsqueda global) or
  `useBoardOTs` (Tablero). OT 41071 (May, past the old cut) is found.
  Mano de obra's OT filter lists the OTs that have labour in the period.
- C3: `useProductionSchedule()` (new hook) is the one schedule; the Gantt and
  Hoja both use it. Hoja is now the printable day of the Cronograma (22 OTs on
  14 machines today) and no longer edits `ot_machine_schedule` — pins are set
  in the Gantt. The table stays.
- C4: Consola shows "Horas mes" from the ledger (`/api/analytics/labor-by-person`,
  reading the same labour lines; format and parser now live together in
  `src/lib/labor-line.ts`). Scores show only when set ("Sin evaluar"
  otherwise). Planta auto-fill ranks by the station's skill level
  (`workerSortScore`), not `overall_rating`. Migration
  `20261126120000_una_evaluacion_existe_solo_si_alguien_la_hizo` drops the
  75/100 defaults and clears the 23 rows still at the default on all five
  scores — applied locally, **not yet on the cloud**.
- C5: `src/lib/limits.ts` (10M units, $5,000M per document, $1,000M per unit
  cost) used by quotes, OTs, guides, invoices, purchases, inventory and the
  capture thread; 5 tests.
- C6: Carga reads closed-pass hours (14.5 h, same as the ledger), places each
  pass with the costing's own resolver (`passMachineCandidates`), and shows
  hours whose exact machine is unknown as "Corte inicial — máquina sin
  precisar" instead of guessing.

---

## Phase 2 — High (≈ 4 d)

| # | Fix | Steps |
| --- | --- | --- |
| H1 | Garbage counter readings | 1. The one reading writer rejects a jump above a per-unit maximum (hours vs impressions). 2. Correct the 3 presses' readings (**data change — asks you first**). |
| H2 | `/m` page raw date, English unit | Shared `formatDate` (es-CL) and one unit-label map used by both the counter page and `/m`. |
| H3 | `/track` promises a past date | Late → "En proceso — nueva fecha por confirmar". Brand from company settings (same source as M12). |
| H4 | `&amp;` in names | No current code escapes on write; the rows are old. Clean them (**data change — asks you first**); add a test that the API stores raw text. |
| H5 | Browser reads of business tables | Move `use-financial-queries`, `use-maintenance-queries` and the 4 HR tabs (Certificaciones, Contratos, Incentivos, Licencias) behind API routes. |
| H6 | Diagnósticos roles "unknown" | `/api/admin/diagnostics` reads `user_metadata.role`; use the same role lookup as `/api/admin/users`. |
| H7 | 38 employees without accounts | Becomes L2: bulk-create from Usuarios. |

**Status 2026-11-26: code done and deployed; one data correction (H1) waits
for the owner.**

- H1: `src/lib/usage-reading.ts` — a reading may not grow faster than its unit
  can since the previous one (24 h/day, 360,000 impressions/day, 1,500 km/day);
  first readings have an absolute cap. Both writers use it (`/api/machines/[id]/usage`,
  machine creation); 6 tests. The Roland 300's stored 25,019,831 "hours" is
  still in the data — correcting it needs the owner's OK.
- H2: `/m/[token]` prints dates with `formatCalendarDate` (new, in
  `src/lib/format.ts`; no time-zone shift) and units with `usageUnitInline`.
- H3: `/api/track/[token]` returns `deadline_passed` (plant date) and
  `shop_name` from `EMPRESA` in `src/lib/company.ts` — the shop's one identity
  record, already used by the printed quote and the privacy policy (a second
  `company-profile.ts` source added that day was removed in Phase 3). Late
  orders read "en proceso, nueva fecha por confirmar"; "GonsAdmin" is gone.
- H4: nothing to do — no escaped names remain in any table (they were the QA
  clients deleted 2026-11-25) and no code escapes on write.
- H5: the real scope was 27 browser reads in 10 files, not 15. Ten hooks had
  no callers and were deleted (8 in use-employees, useMaintenanceStats,
  useWorkerName, useBatchesAvailable on a table that no longer exists). The
  rest go through existing routes (machine supplies, inventory items, cost
  model) or the new declared-read registry `GET /api/reads/[name]` (machine
  costs, investments, payroll, Planta's HR context, publish-week limits,
  calendar dates) — fixed table, columns, filters and roles per name, not a
  table proxy. Found and fixed on the way: "Publicar semana" in Planta asked
  for `contract_start_date`/`contract_end_date`, columns that do not exist.
- H6: `src/lib/user-roles.ts` (`rolesByUserId`, from `user_roles`) used by
  both Users and Diagnósticos; a failed read is reported, not shown as
  "unknown".

---

## Phase 3 — UI (≈ 5 d, much of it absorbed by Phase 0)

| # | Fix | Via |
| --- | --- | --- |
| M1 | Inicio says nothing | `/api/inbox` per role: late OTs, approvals, alarms, captures, maintenance due. Launcher moves below. |
| M2 | Tablero hexes don't scale | Swimlanes by phase with compact cards; hex stays as "vista general". Phone: list by phase. |
| M3 | Phone overflow | F1, F3, F4 |
| M4 | "0 clientes" while loading | Skeleton until data |
| M5 | Big zero KPI cards | F2 |
| M6 | Compras stale actions | Hide "Recibir" when received; auto-close OC when received + invoiced |
| M7 | Despachos mixes done and pending | Split pendiente / cerrado; round once, at the invoice |
| M8 | Cotizaciones shows 2 rows | Searchable list of all quotes, status filter, conversion per month |
| M9 | Maintenance all overdue; disabled button | Re-baseline with the real shop (part of L1); tooltip on disabled actions |
| M10 | English left | "Month", "Loading", machine names (data) |
| M11 | Missing accents | "Nuevo Artículo", "Sin artículos" |
| M12 | Personal email on quotes | Company settings: name, email, phone (one row, used by quote, `/track`, emails) |
| M13 | Rendimiento shows 0 % | Redirect to Resumen until something writes those metrics |

Slow screens (Certificaciones 33 s, Habilidades 31 s, Mecánica 29 s): fetch
per tab and page long lists; F3 covers the rendering side.

**Status 2026-11-26: code done. Three owner decisions pending (machine names,
closing the 218 settled OCs, the company email).**

- M1: `GET /api/inbox` + `src/lib/inbox.ts` (which role sees what, labels,
  links) + `InboxPanel` on Inicio, above the honeycomb. Each item is one count
  from its owning table, linking to the screen that owns the work.
- M2: `KanbanLanes` (default) — lanes per phase, stages as drop targets,
  compact rows; same handlers as the hex board, which stays as "Vista
  general" (remembered per browser). "Completadas (30 días)" says its window.
- M3/M5: Phase 0 primitives; Personas' summary is now a `StatsBar`
  (local `StatCard` removed).
- M4: Clientes shows a skeleton, not "0 clientes", while loading.
- M6: `canReceive` looks at what is still to arrive (an invoiced OC can now
  receive its last delivery; a fully received one no longer offers
  "Recibir"); the receive route enforces it. `isSettled` + `settlePurchase`
  close an OC after the receipt or invoice that completes it.
- M7: `src/lib/dispatch-billing.ts` — the invoice that completes an OT takes
  the remainder (rounds once); Despachos splits Pendientes / Cerradas.
- M8: Cotizaciones › Historial — conversion per month
  (`/api/reads/quote-conversion`, scoped for vendedores,
  `src/lib/quote-conversion.ts`) and search over every OT (the OT is the
  quote).
- M9: a disabled "Crear orden" now SAYS why, with a link to Pautas (a
  disabled button cannot show a tooltip). Re-baselining the plans is L1.
- M10: Talento's skill tree (117 strings in `craft-skill-paths.ts` + the
  components), Planta's statuses and the payroll label are in Spanish.
  English machine names are data (owner decision).
- M11: accent sweep of all visible text; plus Pre-Prensa's "Programar en Hoja
  de Producción" now points to Planificación (the Hoja is read-only since C3;
  `/api/ot-schedule` still sets the assigned machine).
- M12: the company identity lives in `src/lib/company.ts`; its email is now
  info@gonsa.cl (owner, 2026-11-26), used by the quote and the privacy policy.
- Owner decisions applied 2026-11-26: 8 machines renamed to Spanish (cloud +
  local). The 218 settled seed OCs were NOT closed: none was ever issued (no
  number, issuer or date) and `purchases_emitida_esta_completa` rejects a
  status change without them; inventing those would forge a legal document.
  `settlePurchase` skips unissued OCs. Real (issued) OCs close on their own.
- M13: `/analitica/rendimiento` redirects to the Resumen; `WorkerStatsReport`
  removed.
- `/api/reads` now authenticates before resolving the read name and validates
  parameters with zod (src/app/api/CLAUDE.md).

---

## Phase 4 — Launch prerequisites (owner-dependent)

| # | Item | Waiting on |
| --- | --- | --- |
| L1 | Real data | Your decision (seed kept for now) |
| L2 | Floor accounts + role testing | Dev: bulk create; then each role runs its day on staging |
| L3 | DTE | Nubox credentials, client giro/región/comuna, UAT test, "Enviar al SII" button |
| L4 | Restorable backup | Q-2 (Supabase plan); then daily off-site dump + one test restore |
| L5 | WhatsApp | Meta template approval |

---

## Order and gates

| Step | Contents | Gate before moving on |
| --- | --- | --- |
| 1 | Phase 0 (F1–F8) | Layout crawl clean at 4 widths |
| 2 | C1, C5, C4, H6, H2, M10, M11 | Quick, independent; tests green |
| 3 | C2 (search + aggregates) | No `useOTs` sum left in the browser |
| 4 | C3, C6 | Hoja = Cronograma; Carga = ledger |
| 5 | H1, H3, H4, H5 | Data changes confirmed by you first |
| 6 | Page upgrades (M1, M2, M6–M8, M12, M13) | Each page passes the crawl |
| 7 | Rerun the full audit crawl | No screen shows a number its own table contradicts |

Each step: typecheck, tests, layout crawl, one commit per step, deploy to
master. Any migration (for example dropping the unused `attendance_events`)
is asked for separately before it is pushed.

Estimated total: about 20 developer-days for Phases 0–3.

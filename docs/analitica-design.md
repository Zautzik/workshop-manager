# Analítica — "Executive Command Center" design

> Design/wireframe spec for review. **No app code changed.** Goal: turn six
> disconnected screens into one cohesive, professional BI module.
> Wireframes are ASCII sketches — layout intent, not pixel-final.

## North star
The screen the owner opens every morning and shows investors. Every number is
real, trends are computed from history, everything is filterable by period, and
every KPI drills down to its source. One glance answers: **"Is the shop winning today?"**

## Existing data we build on (no new infra for most of it)
`useOrderLaborMargin`, `useOTFinancials`, `useMachineCosts`, `useEmployeeCostTimeline`,
`useMonthlyPayroll`, `useWorkerStats`, `useEquipmentInvestments`, `useOTs`,
`useInventory*`, `usePurchases`, `useAdminStats`; `reporting/snapshots` +
`reports/export` endpoints; **`ot_status_history`** (already written by transition
routes) powers trazabilidad + cycle-time. Recharts is already in.

---

## 0. The shared spine (build once → every section inherits)

### 0.1 Global control bar (sticky, top of every Analítica page)
```
┌──────────────────────────────────────────────────────────────────────────┐
│  Analítica ▸ Márgenes        [ Mes ▾ ]  [◀ Jun 2026 ▶]  vs [Mes ant. ▾]   │
│                              Cliente:[Todos ▾] Máquina:[Todas ▾] Área:[▾]  │
│                                              [⤓ Exportar ▾]  [⟳ Snapshot]  │
└──────────────────────────────────────────────────────────────────────────┘
```
- `<AnalyticsFilters>` context → date range, granularity (día/sem/mes), comparison
  period, and entity filters. **Every section reads from it.**
- Export menu (PDF / Excel / PNG) wired to existing `reports/export`.
- Powers the "vs" deltas (real, not hardcoded).

### 0.2 Reusable building blocks (new shared components)
| Component | Purpose |
|---|---|
| `<KpiStat trend sparkline target/>` | big number + real Δ vs comparison + mini sparkline + target bar |
| `<TrendChart>` | time-series line/area honoring the global granularity |
| `<DrilldownCard>` | clickable card → navigates to a filtered detail view |
| `<MiniLeaderboard>` | ranked top/bottom N with bars |
| `<EmptyState>` / `<ErrorState>` | consistent "no data" / failure (kills raw error dumps like Nómina's) |

### 0.3 Analítica home (the landing becomes a live summary, not just a honeycomb)
```
┌── ESTADO DEL NEGOCIO ───────────────────────────────────────────────────┐
│   🟢 SALUDABLE     Ingresos mes $X (+12% real)   Margen 34%   OEE 71%     │
├──────────────┬──────────────┬──────────────┬───────────────┬────────────┤
│ Ingresos ▲   │ Margen ▲     │ OEE ▬        │ Entregas ▲    │ Nómina ▼   │
│ $X  +12% ╱   │ 34%  +2pt ╱  │ 71%  ─ ╲     │ 94%  +2% ╱    │ $Y  -3% ╲  │
├──────────────┴──────────────┴──────────────┴───────────────┴────────────┤
│  Ingresos vs Costos (12 sem)    │  Top 5 OTs por margen  │ ⚠ Alertas    │
│  ▁▂▃▅▆▇█ area chart              │  ▇▇▆▅▃ bars            │ • Costo OT.. │
└─────────────────────────────────┴────────────────────────┴──────────────┘
   [Costos] [Márgenes] [Nómina] [Rendimiento] [Trazabilidad]  ← quick nav
```
Hero verdict + 5 KPI tiles (each a `<DrilldownCard>`) + revenue/cost trend +
top-margin OTs + the cost-overrun alerts (`useCostOverrunAlerts` already exists).

---

## 1. Dashboard (Executive Overview) — make it *real*
**Today:** good layout, but `+12%`/`+2.3%` are hardcoded; no date range; no drill-down.
**Redesign:**
```
[ KPI: Órdenes Activas ╱ ]  [ Entregas a Tiempo ╱ ]  [ OEE ╲ ]  [ Eficiencia ╱ ]
   each = real Δ vs prior period + sparkline + target bar; click → filtered list
┌── Ingresos vs Costos vs Margen (trend) ──┬── OEE por máquina (tiempo) ──┐
│  multi-line over selected range          │  small multiples / heatmap   │
├── Embudo de producción (por etapa) ──────┴── Salud de activos (pie) ────┤
│  funnel uses otStatusLabel (done)         │  machine status (done)       │
└── Matriz de Desempeño por Área ──────────────────────────────────────────┘
```
- Replace fake deltas with `useOTFinancials`/history deltas.
- KPI cards become `<DrilldownCard>` (→ Márgenes/Trazabilidad filtered).
- Add real OEE-over-time and revenue/cost/margin trend lines.

## 2. Costos → "Inteligencia de Costos"
**Today:** material price-list CRUD only.
**Redesign:** keep the catalog as a tab; add an **Análisis** tab:
```
[ Tab: Análisis | Catálogo ]
┌ Costo prom/OT ╱ ┐ ┌ Variación cotiz-real ┐ ┌ Top driver de costo ┐
│  $X  +5%        │ │  +8% sobre cotizado  │ │  Papel 41%          │
└─────────────────┘ └──────────────────────┘ └─────────────────────┘
┌── Costo por categoría (tiempo) ──────┬── Precio de materiales (trend) ──┐
│  stacked area: papel/tinta/MO/...    │  line per material               │
├── Variación cotización vs real por OT ───────────────────────────────────┤
│  bar/waterfall: quoted → actual, flag overruns (red)                     │
└──────────────────────────────────────────────────────────────────────────┘
```
Data: `useOTFinancials`, `useMachineCosts`, OT operations vs real costs
(`ot_real_costs`). New: a "cost by category over time" aggregation.

## 3. Márgenes → "Rentabilidad"
**Today:** one flat table + 5 cards.
**Redesign:**
```
[ KPI margen prom ╱ ] [ Margen $ ╱ ] [ OTs bajo umbral ⚠ 3 ] [ Mejor cliente ]
┌── Margen en el tiempo ───────────┬── Distribución de margen (histograma) ┐
│  line + target band               │  bars by margin bucket               │
├── Cascada: Ingresos→Costos→Margen ┴── Rentabilidad por cliente/producto ─┤
│  waterfall                         │  ranked bars                         │
├── Tabla (la actual) + semáforo + fila clic → detalle OT ─────────────────┤
└──────────────────────────────────────────────────────────────────────────┘
```
Data: `useOrderLaborMargin` (already there) + grouping by client/product/time.
Auto-flag OTs below a configurable margin threshold.

## 4. Nómina — **fix, then enrich**
**Today:** BROKEN — "42 assignments could not be mapped to an employee"
(worker→employee drift); English headers.
**Redesign:**
1. **Fix the data mapping** (worker_legacy_id → employees) so the calc runs.
2. Spanish headers (Horas Reg., Horas Extra, Pago Base, Nocturno, Fin de Semana,
   Incentivos, Bruto).
3. Add:
```
[ Costo laboral mes ╲ ] [ Horas extra % ] [ Costo/área ] [ vs presupuesto ]
┌── Costo laboral en el tiempo ────┬── Horas extra por área ──────────────┐
└── Tabla por empleado (export PDF payslip por fila) ──────────────────────┘
```
Data: `useMonthlyPayroll` (fix), `useEmployeeCostTimeline` (already there).

## 5. Rendimiento (Análisis) — **compute the metrics**
**Today:** all zeros — no computed data.
**Redesign:**
1. Compute efficiency/throughput/quality from `worker_assignments` + tasks +
   `whatsapp_production_logs` (real production capture).
2. Layout:
```
[ Eficiencia equipo ╱ ] [ Tareas completadas ] [ Mejor área ] [ Calificación ]
┌── Leaderboard trabajadores ──────┬── Eficiencia por área (heatmap) ──────┐
│  ranked bars, click → perfil      │  area × week color grid              │
├── Perfil del trabajador (drawer): tendencia, habilidades, asistencia ────┤
└──────────────────────────────────────────────────────────────────────────┘
```
Data: `useWorkerStats` (wire to real), assignments, production logs.
(Depends on the same worker→employee data fix as Nómina.)

## 6. Trazabilidad → "Ciclo de Vida de OT"
**Today:** a lone search box.
**Redesign:** uses **`ot_status_history`** (built in Track 2):
```
┌ Buscar OT [______]  | Recientes:  OT-101 OT-102 ...                       │
├── KPIs ciclo: Lead time prom ╱ | Cuello de botella: Troquelado | WIP: 5 ──┤
├── Línea de tiempo de la OT (timeline vertical) ──┬── Tiempo por etapa ────┤
│  ● Pre-Prensa  2h   ● Offset 4h   ● Troquelado.. │  bar: avg time-in-stage│
├── Feed de actividad reciente (quién movió qué) ──┴────────────────────────┤
└──────────────────────────────────────────────────────────────────────────┘
```
Data: **new** `GET /api/ots/[id]/history` (read `ot_status_history`) + an
aggregate "avg time-in-stage" query for bottleneck analysis.

---

## New data/endpoints required (small)
- `GET /api/ots/[id]/history` — read `ot_status_history` for the timeline.
- Aggregations (server or client): cost-by-category-over-time, margin-by-client,
  avg-time-in-stage, labor-cost-over-time.
- **Data fix** (blocking Nómina + Rendimiento): repair `worker_legacy_id` →
  `employees` mapping (the drift from [[supabase-schema-drift-history]]).

## Suggested phasing
1. **Spine** (0.1–0.3): filters context, shared components, Analítica home.
2. **Dashboard** real trends + drill-down (most visible).
3. **Márgenes** profitability suite (data already there → fast win).
4. **Trazabilidad** timeline (showcases `ot_status_history`).
5. **Data fix** → **Nómina** + **Rendimiento** become real.
6. **Costos** intelligence tab.
7. **Wow layer**: forecasting, anomaly alerts, period comparisons everywhere.

## Open design questions
- Margin threshold for "low-margin" flag — what % is the red line?
- Forecasting: simple linear trend, or do you want seasonality?
- Export format priority — PDF (board deck) first, or Excel (analyst)?
- Should Analítica home replace the honeycomb landing, or be a tab within it?

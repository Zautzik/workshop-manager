# Workshop hardening + Spanish i18n + IA reorganization

Audit-driven pass across the app: OT workflow correctness, DB/type reconciliation,
full Spanish coverage, the Next 16 `proxy` rename, and a complete navigation +
URL reorganization into concept-matched modules.

**7 commits · 146 files · +2,446 / −1,241**

---

## What's in here

### 1. OT workflow hardening (`feat(ot)`)
- **Atomic split** via a `split_ot()` Postgres function — fixes duplicate split
  labels / `ot_number` collisions and the group-corrupting JS rollback.
- **Concurrency guard** on single transitions (409 on concurrent change instead of
  silent clobber), matching the bulk-transition route.
- **`ot_status_history` audit trail** written on every transition (single + bulk).
- Cost model made offset-consistent; no printing line for "sin impresión" jobs.
- `ots.status` default → `pre_press`.

### 2. DB / types reconciliation (`chore(db,types)`)
- Regenerated `types.ts` from the live DB; reconciled three-way drift between code,
  migrations, and the database.
- Synced enums the app already used but the DB lacked (`digital_printing`,
  `tercerizado`).
- Removed 19 structural `as any` casts; **fixed 2 latent bugs** the stricter types
  surfaced (`track` selected a non-existent `due_date` → `deadline`; employee
  soft-delete wrote invalid `archived` → `terminated`).

### 3. Spanish i18n (`i18n` ×2)
- Translated the UI to Spanish-only across ~40 components.
- Completed coverage on analytics/dashboards: fixed `t()` screens that rendered raw
  keys, translated the executive dashboard, shifts view and inventory; fixed a
  bullet **mojibake** (`â€¢` → `•`).
- New `src/lib/status-labels.ts` — Spanish display labels for OT/machine/rating
  enums (data values stay English), wired into charts, badges and legends.

### 4. Next 16 `proxy` migration (`chore(next)`)
- `src/middleware.ts` → `src/proxy.ts` (function `middleware` → `proxy`), per the
  Next 16 deprecation. Same runtime (rate limiting, CSP nonce, request-id tracing).

### 5. Navigation + route reorganization (`feat(nav)`)
- **Single source of truth** (`src/lib/navigation.ts`) drives both the sidebar and
  the module landing pages — eliminates the prior drift; every module gets a submenu.
- **Module-matched URLs** (redirects from every old path):
  | Old | New |
  |---|---|
  | `/workflow` | `/operaciones` (+ inventario, compras, proveedores) |
  | `/hr` | `/personas` (+ capacitacion, operarios) |
  | `/maintenance` | `/equipos` |
  | `/financial` + `/manager` + `/admin/overview` | `/analitica` (13 sections) |
  | `/admin` | `/administracion` |
- **Resolved ~22 orphan routes**: surfaced the valuable ones in nav (Costo por OT,
  Costo Máquina, Inversión, Seguimiento OT, Tendencias, Actividad, Auditoría,
  Proveedores, Operarios, Integraciones), redirected true duplicates, kept
  sub-routes as deep links.

---

## ⚠️ Migrations to apply (DB)
Run on the target database before/with deploy (most already applied in dev):
`split_ot`, `ot_status_history`, `ot_default_status_prepress`, the
schema-sync (`supabase/manual/sync_missing_schema.sql`), and the enum-sync
(`20260614120000_ot_status_add_digital_printing.sql`).

## Notes for reviewers / deploy
- `next.config.js` adds ~35 redirects (307) from old URLs → new. Flip to permanent
  (308) once the IA settles.
- Redirects activate on server start; after pulling, run with a clean `.next`.
- **Verified:** `tsc --noEmit` 0 errors · `vitest` 31/31 pass.

## Known follow-ups (not in this PR)
- Analítica "executive command center" build-out (design in `docs/analitica-design.md`).
- Merge HR orphan pages (certificaciones/contratos/incentivos) into the Empleados
  dashboard tabs; reconcile `planta` vs `planta-integrada`, `warehouse` vs `inventario`.
- Worker→employee data mapping fix (unblocks Nómina + Rendimiento metrics).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

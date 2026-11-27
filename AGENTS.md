<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GonsAdmin (`workshop-manager`) — Agent Operating Rules

Print-shop ERP/MES connecting commercial quoting, work orders (`OT`), paper pallet/sheet traceability, WhatsApp shop-floor reporting, real-cost ledger rollups, and Nubox DTE invoicing.

## 1. Non-Negotiable Architecture & Security Invariants

1. **Unidirectional Layering (`UI -> API -> Domain -> DB`):**
   - `src/lib/**` is pure, framework-agnostic TypeScript domain logic (zero React imports, zero `next/server` route imports).
   - **NEVER** import from `src/app/**` inside `src/lib/**`. Extract shared mutation helpers into `src/lib/`.
2. **Dual-Door Security Model (CRITICAL):**
   - **Door 1 (Server API):** `src/integrations/supabase/server.ts` exports `supabaseAdmin` (`service_role`), which **bypasses Postgres RLS**. Every handler in `src/app/api/**` MUST call `requireAuth()` from `src/lib/api-middleware.ts` on line 1 (only explicit exceptions: `/api/auth`, `/api/health`, `/api/cron`, `/api/whatsapp/webhook`, and token-scoped `/api/track/[token]` & `/api/maquina/[token]`).
   - **Door 2 (Browser Direct / Realtime):** Login uses NextAuth, NOT Supabase Auth. Any browser hook or Realtime channel using the public `anon` key queries Postgres as an `anon` user. Never weaken RLS policies to "fix" a frontend query.
3. **Single-Writer Financial & Stock Ledger:**
   - Shop-floor captures ONLY turn into real costs or paper stock movements via `/api/captures/review` -> `src/lib/golden-thread.ts` -> Postgres RPC `apply_capture_event` (with `SELECT ... FOR UPDATE` row locking). Never write direct `INSERT`/`UPDATE` shortcuts to cost or stock ledgers from routes or UI.
4. **Webhook & Multi-Event Idempotency:**
   - External webhooks (Meta WhatsApp) deliver at-least-once, and one WhatsApp message (`wamid`) can parse into multiple domain events (`END` + `START`). Idempotency keys must account for `(external_message_id, event_index)` — never assume 1 `wamid` == 1 database row.
5. **Migrations & Generated Types:**
   - Never edit historical SQL files in `supabase/migrations/` that have already run. Always create a new timestamped forward migration.
   - Never hand-edit `src/integrations/supabase/types.ts`; regenerate it via `node scripts/gen-types.mjs` after schema changes.
6. **React Query Cache Sync:**
   - Mutations affecting captures, OTs, costs, or stock must invalidate all affected query keys (see `src/hooks/review-cache.ts`).

## 2. Verification Commands (Run Before Declaring Work Complete)

Do not stop when code "looks done." Run the smallest check that proves your change:

- **Typecheck & Lint:** `npx tsc --noEmit && npm run lint`
- **Unit / Integration Tests:** `npm test` (or `npx vitest run <path-to-test>`)
- **Anon Key / RLS Leak Audit (run after any migration or policy edit):**
  `node scripts/check-anon-visibility.mjs && node scripts/check-rls-drift.mjs`
- **Migration Hygiene Audit (run after adding SQL migrations):**
  `node scripts/check-migration-redefinitions.cjs && node scripts/check-dead-function-refs.cjs`
- **Concurrency / Race Check (when touching lot reservations):**
  `node scripts/verify-lot-reservation-race.mjs`
- **CSP Header Check (when touching `src/proxy.ts` or `next.config.js`):**
  `node scripts/verify-csp-wiring.cjs`

## 3. Workflow & Approval Boundaries

- **Plan Before Multi-File Edits:** For changes touching >2 files, database migrations, or `src/lib/golden-thread.ts` / `ot-state-machine.ts`, state the plan, affected files, and test case before writing code.
- **TDD for Bug Fixes:** Write a failing Vitest test reproducing the bug first (without mocking away the bug boundary), confirm it fails, then implement the fix.
- **Ask First Before:** Running destructive DB commands, altering `.env*`, modifying `src/proxy.ts` rate limits/CSP, or pushing to remote branches.
- **Language & Domain Terms:** Code identifiers in English/established Spanish domain terms (`OT` = work order, `pliego` = sheet, `merma` = waste, `pasada` = press pass, `parte` = shop-floor report). Keep explanations concise and cite `file:line`.

## 4. Progressive Context Map (Read Only When Relevant)

Do NOT read `docs/` wholesale. Load only the reference matching your current task:
- Deep architecture & domain walkthrough: `MASTERCLASS.md`
- System health & operational invariants: `docs/organism-vital-signs.md`
- WhatsApp capture & parser design: `docs/capture-understanding-phase0.md`
- Cost ledger, quotes & Visto Bueno specs: `docs/spec-cost-ledger-and-vb.md`, `docs/spec-cotizacion-a-ot.md`
- Purchasing, OC & Nubox DTE invoicing: `docs/spec-oc-y-facturas.md`, `docs/nubox-integracion.md`
- Pre-launch audit remediation tracker: `docs/plan-arreglos-y-pantallas-2026-11-25.md`
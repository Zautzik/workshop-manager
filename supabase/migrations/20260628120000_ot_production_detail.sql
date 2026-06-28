-- ============================================================
-- OT production detail → DB (was localStorage-only)
--
-- The unified OT wizard captured the full production bundle (montaje,
-- finishing, machine, tapas, pliegos, admin, work_category) but stashed it in
-- the creator's browser localStorage (`ot-production-<id>`). That data was lost
-- across devices and cache clears — disqualifying for a traceability product.
--
-- This adds a JSONB column so the bundle is persisted with the OT.
-- Safe to re-run: YES (IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS production_detail jsonb;

COMMENT ON COLUMN public.ots.production_detail IS
  'Full OT production bundle captured by the unified wizard (montaje, finishing, machine, tapas, pliegos, admin, work_category). Replaces the prior per-browser localStorage stash.';

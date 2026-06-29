-- ============================================================
-- COST1.1 — Cost catalog → DB (out of the browser cache)
--
-- The cost catalog (the rates we price jobs on) lived in localStorage
-- (`workshop_cost_center`) — per-device, unshared, erased on cache-clear (audit
-- A3/D2/#38). This is its shared home. The API lazily seeds it from the
-- canonical TS defaults (DEFAULT_COST_CENTER) on first read, so no 45-row SQL
-- seed is needed here.
--
-- This is configuration (the audit's "reclassify the catalog as config"): the
-- single source the estimate engine will read (COST layers 2–3).
--
-- Additive + idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cost_catalog (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,                 -- CostCategory (papel|tinta|…|overhead)
  unit       TEXT NOT NULL DEFAULT 'und',   -- kg|und|hrs|pliego|click|mt|lt|%
  unit_cost  NUMERIC(14,4) NOT NULL DEFAULT 0,  -- CLP (or % when unit = '%')
  is_active  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_catalog_category ON public.cost_catalog(category);
CREATE INDEX IF NOT EXISTS idx_cost_catalog_active   ON public.cost_catalog(is_active);

DROP TRIGGER IF EXISTS update_cost_catalog_updated_at ON public.cost_catalog;
CREATE TRIGGER update_cost_catalog_updated_at
BEFORE UPDATE ON public.cost_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS (authenticated read, ops manage) ────────────────────
ALTER TABLE public.cost_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view cost catalog" ON public.cost_catalog;
CREATE POLICY "Authenticated can view cost catalog"
ON public.cost_catalog FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ops roles manage cost catalog" ON public.cost_catalog;
CREATE POLICY "Ops roles manage cost catalog"
ON public.cost_catalog FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

COMMENT ON TABLE public.cost_catalog IS
  'Shared cost catalog (rates for pricing). Was localStorage workshop_cost_center; lazily seeded from DEFAULT_COST_CENTER on first API read.';

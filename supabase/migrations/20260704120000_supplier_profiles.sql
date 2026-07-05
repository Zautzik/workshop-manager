-- ============================================================
-- SUP1 — Supplier profiles: categories + certifications (PEFC)
--
-- The Proveedores directory is derived from purchases (free-text supplier). This
-- adds an editable overlay keyed by supplier name so we can record, per supplier:
--   • what categories of products/services they supply (flexible catalog —
--     inks, papers, machine cleaning, office cleaning, … create your own)
--   • their certifications (PEFC chain-of-custody, FSC, ISO…) with code + expiry
--
-- PEFC context: for our PEFC claim, paper suppliers must themselves be certified;
-- this makes that visible alongside the lot-level traceability already on
-- inventory_lots (certification_code / expires + purchase_id → OC → supplier).
--
-- Additive + idempotent.
-- ============================================================

-- ─── Flexible category catalog (user-manageable) ────────────
CREATE TABLE IF NOT EXISTS public.supplier_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  kind       TEXT,                    -- optional grouping: 'material' | 'service'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sensible defaults (the user can add/rename more).
INSERT INTO public.supplier_categories (name, kind) VALUES
  ('Tintas',                         'material'),
  ('Papeles y cartulinas',           'material'),
  ('Planchas CTP',                   'material'),
  ('Barnices y adhesivos',           'material'),
  ('Químicos / limpieza de máquinas','material'),
  ('Repuestos y mantención',         'material'),
  ('Terminaciones y acabados',       'service'),
  ('Servicios tercerizados',         'service'),
  ('Limpieza de oficinas',           'service'),
  ('Logística y transporte',         'service')
ON CONFLICT (name) DO NOTHING;

-- ─── Supplier profile (editable overlay, keyed by purchases.supplier) ──
CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name  TEXT UNIQUE NOT NULL,          -- matches purchases.supplier
  rut            TEXT,
  giro           TEXT,
  email          TEXT,
  phone          TEXT,
  category_ids   UUID[] NOT NULL DEFAULT '{}',  -- → supplier_categories.id
  certifications JSONB  NOT NULL DEFAULT '[]',  -- [{name, code, expires_on}]
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_profiles_name ON public.supplier_profiles(supplier_name);

DROP TRIGGER IF EXISTS update_supplier_profiles_updated_at ON public.supplier_profiles;
CREATE TRIGGER update_supplier_profiles_updated_at
BEFORE UPDATE ON public.supplier_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS (authenticated read, ops manage) ────────────────────
ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_profiles   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view supplier categories" ON public.supplier_categories;
CREATE POLICY "Authenticated can view supplier categories"
ON public.supplier_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Ops roles manage supplier categories" ON public.supplier_categories;
CREATE POLICY "Ops roles manage supplier categories"
ON public.supplier_categories FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated can view supplier profiles" ON public.supplier_profiles;
CREATE POLICY "Authenticated can view supplier profiles"
ON public.supplier_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Ops roles manage supplier profiles" ON public.supplier_profiles;
CREATE POLICY "Ops roles manage supplier profiles"
ON public.supplier_profiles FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

COMMENT ON TABLE public.supplier_profiles IS
  'Editable overlay on the derived supplier directory: categories supplied + certifications (PEFC chain-of-custody etc.), keyed by purchases.supplier.';

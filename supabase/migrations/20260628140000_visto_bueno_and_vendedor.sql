-- ============================================================
-- C1.1 — Visto Bueno + Vendedor role + sales ownership (foundation)
--
-- The Visto Bueno is the quote that becomes an OT (one-tap, zero re-entry).
-- It carries the estimate that freezes into the OT's cost ledger on conversion.
--
-- Ownership: a `vendedor` owns their clients / VBs / OTs (salesman_id). The
-- row-level *scoping* is enforced in the API layer (like useOTs) so this
-- migration stays free of any auth↔employee mapping assumptions.
--
-- Additive + idempotent.
-- NOTE: 'vendedor' is added here but intentionally NOT referenced in this
-- migration's policies (a new enum value can't be used in the same transaction).
-- ============================================================

-- ─── Vendedor role ───────────────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- ─── Sales ownership columns ─────────────────────────────────
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS salesman_id UUID
  REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS salesman_id UUID
  REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_salesman ON public.clients(salesman_id);
CREATE INDEX IF NOT EXISTS idx_ots_salesman     ON public.ots(salesman_id);

-- ─── VB status enum ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vb_status') THEN
    CREATE TYPE public.vb_status AS ENUM
      ('draft', 'sent', 'signed', 'converted', 'rejected', 'expired');
  END IF;
END $$;

-- ─── Correlative VB number (VB-00001) ────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.vb_number_seq START 1;

-- ─── Visto Bueno table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vistos_buenos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vb_number     TEXT UNIQUE NOT NULL DEFAULT 'VB-' || lpad(nextval('public.vb_number_seq')::text, 5, '0'),
  client_id     UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name   TEXT,
  salesman_id   UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  -- spec (= OT spec, copied verbatim on conversion)
  product_name  TEXT,
  product_type  TEXT,
  quantity      INTEGER,
  width_cm      NUMERIC,
  height_cm     NUMERIC,
  substrate_type TEXT,
  grammage_gsm  INTEGER,
  color_front   TEXT,
  color_back    TEXT,
  pantone_colors TEXT[],
  ink_coverage  TEXT,                  -- light|medium|heavy or % — cost driver
  finishes      JSONB,
  -- estimation snapshot
  estimate_lines JSONB,                -- [{category,description,quantity,unit,unit_cost}]
  subtotal_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  margin_pct    NUMERIC NOT NULL DEFAULT 0,
  markup_pct    NUMERIC NOT NULL DEFAULT 0,
  total_price   NUMERIC(16,2) NOT NULL DEFAULT 0,
  unit_price    NUMERIC(16,4) NOT NULL DEFAULT 0,
  floor_price   NUMERIC(16,2) NOT NULL DEFAULT 0,  -- guardrail: can't quote below
  rush_surcharge_pct NUMERIC NOT NULL DEFAULT 0,
  -- lifecycle
  status        public.vb_status NOT NULL DEFAULT 'draft',
  signed_at     TIMESTAMPTZ,
  signed_by_name TEXT,
  signature_url TEXT,
  valid_until   DATE,
  ot_id         UUID REFERENCES public.ots(id) ON DELETE SET NULL,  -- set on conversion
  pdf_url       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vb_salesman ON public.vistos_buenos(salesman_id);
CREATE INDEX IF NOT EXISTS idx_vb_status   ON public.vistos_buenos(status);
CREATE INDEX IF NOT EXISTS idx_vb_client   ON public.vistos_buenos(client_id);

-- ─── RLS (permissive view; manage by ops roles — vendedor scope is in the API) ──
ALTER TABLE public.vistos_buenos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view VBs" ON public.vistos_buenos;
CREATE POLICY "Authenticated can view VBs"
ON public.vistos_buenos FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ops roles manage VBs" ON public.vistos_buenos;
CREATE POLICY "Ops roles manage VBs"
ON public.vistos_buenos FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

-- ─── updated_at trigger ──────────────────────────────────────
DROP TRIGGER IF EXISTS update_vistos_buenos_updated_at ON public.vistos_buenos;
CREATE TRIGGER update_vistos_buenos_updated_at
BEFORE UPDATE ON public.vistos_buenos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.vistos_buenos IS
  'Quote / proof (Visto Bueno). On signature, convert_vb_to_ot() spawns a prefilled OT and freezes estimate_lines into the OT cost ledger. See docs/spec-cost-ledger-and-vb.md.';

-- ============================================================
-- L1 — Unified OT cost ledger (the spine)
--
-- One table every cost event writes to (estimate vs actual), plus a roll-up
-- view that replaces the drift-prone ot_financials reads. Backfills existing
-- ot_operations (estimate) and ot_real_costs (actual) so every OT already has
-- a ledger the moment this runs.
--
-- Additive + idempotent. Safe to re-run. Reads are repointed in a later code
-- phase (see docs/spec-cost-ledger-and-vb.md, L1.2).
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cost_line_kind') THEN
    CREATE TYPE public.cost_line_kind AS ENUM ('estimate', 'committed', 'actual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cost_line_category') THEN
    CREATE TYPE public.cost_line_category AS ENUM
      ('material', 'labor', 'machine', 'finishing', 'outsourced', 'overhead', 'other');
  END IF;
END $$;

-- ─── Ledger table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ot_cost_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id       UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  kind        public.cost_line_kind NOT NULL,
  category    public.cost_line_category NOT NULL DEFAULT 'other',
  source      TEXT NOT NULL DEFAULT 'manual',  -- vb|wizard|whatsapp|purchase|inventory|manual|system
  description TEXT NOT NULL,
  quantity    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit        TEXT NOT NULL DEFAULT 'unit',
  unit_cost   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  -- CLP has no cents → store whole pesos.
  total       NUMERIC(16,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost)) STORED,
  ref_type    TEXT,  -- oc|factura_compra|wa_log|lot|guia|operation|real_cost
  ref_id      UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_cost_lines_ot    ON public.ot_cost_lines(ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_cost_lines_kind  ON public.ot_cost_lines(ot_id, kind);
CREATE INDEX IF NOT EXISTS idx_ot_cost_lines_ref   ON public.ot_cost_lines(ref_type, ref_id);

-- ─── RLS (mirrors ot_real_costs) ─────────────────────────────
ALTER TABLE public.ot_cost_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view cost lines" ON public.ot_cost_lines;
CREATE POLICY "Authenticated can view cost lines"
ON public.ot_cost_lines FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors manage cost lines" ON public.ot_cost_lines;
CREATE POLICY "Supervisors manage cost lines"
ON public.ot_cost_lines FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- ─── Roll-up view (replaces drift-prone ot_financials reads) ──
CREATE OR REPLACE VIEW public.ot_cost_summary AS
SELECT
  o.id                                                                              AS ot_id,
  o.ot_number,
  o.client_name,
  COALESCE(o.total_price, 0)                                                         AS revenue,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'estimate'), 0)                     AS estimated_cost,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual'), 0)                       AS actual_cost,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual' AND cl.category = 'material'),  0) AS material_actual,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual' AND cl.category = 'labor'),     0) AS labor_actual,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual' AND cl.category = 'machine'),   0) AS machine_actual,
  COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual'
           AND cl.category IN ('finishing','outsourced','overhead','other')), 0)     AS other_actual,
  COALESCE(o.total_price, 0)
    - COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual'), 0)                    AS gross_margin
FROM public.ots o
LEFT JOIN public.ot_cost_lines cl ON cl.ot_id = o.id
GROUP BY o.id, o.ot_number, o.client_name, o.total_price;

-- ─── Backfill: estimate from ot_operations, actual from ot_real_costs ──
INSERT INTO public.ot_cost_lines
  (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
SELECT
  op.ot_id, 'estimate',
  (CASE op.category::text
     WHEN 'materiales'    THEN 'material'
     WHEN 'impresion'     THEN 'machine'
     WHEN 'terminaciones' THEN 'finishing'
     WHEN 'tercerizado'   THEN 'outsourced'
     ELSE 'other' END)::public.cost_line_category,
  'wizard', op.name, op.quantity, op.unit, op.unit_cost, 'operation', op.id, op.created_at
FROM public.ot_operations op
WHERE NOT EXISTS (
  SELECT 1 FROM public.ot_cost_lines cl WHERE cl.ref_type = 'operation' AND cl.ref_id = op.id
);

INSERT INTO public.ot_cost_lines
  (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
SELECT
  rc.ot_id, 'actual',
  (CASE rc.category
     WHEN 'materiales'    THEN 'material'
     WHEN 'impresion'     THEN 'machine'
     WHEN 'terminaciones' THEN 'finishing'
     WHEN 'tercerizado'   THEN 'outsourced'
     ELSE 'other' END)::public.cost_line_category,
  (CASE WHEN rc.operation_code LIKE 'WA-%' THEN 'whatsapp' ELSE 'manual' END),
  rc.description, rc.quantity, rc.unit, rc.unit_cost, 'real_cost', rc.id, rc.created_at
FROM public.ot_real_costs rc
WHERE NOT EXISTS (
  SELECT 1 FROM public.ot_cost_lines cl WHERE cl.ref_type = 'real_cost' AND cl.ref_id = rc.id
);

COMMENT ON TABLE public.ot_cost_lines IS
  'Unified OT cost ledger: every estimate/actual cost event in one place. Roll-up via ot_cost_summary. See docs/spec-cost-ledger-and-vb.md.';

-- ============================================================
-- D1.1 — Despacho (Guía de Despacho) + Factura de venta + fulfillment
--
-- The outbound / revenue side of the pipeline, with partial fulfillment:
--
--   OT terminada → Guía de Despacho (envío físico, puede ser parcial)
--                → Factura de venta (DTE, agrupa una o varias guías)
--                → pago
--
-- A guía records a shipment of N units of an OT to its client (forward FSSC
-- traceability: which client received which OT). A factura bills one or more
-- guías. ot_fulfillment rolls up dispatched-vs-ordered and invoiced-vs-quoted
-- so an OT can be partially delivered/billed across several guías.
--
-- Additive + idempotent. Apply, then regenerate types.ts.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispatch_status') THEN
    CREATE TYPE public.dispatch_status AS ENUM
      ('draft', 'dispatched', 'delivered', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_invoice_status') THEN
    CREATE TYPE public.sales_invoice_status AS ENUM
      ('issued', 'sent', 'paid', 'cancelled');
  END IF;
END $$;

-- ─── Factura de venta (created first; guías reference it) ────
CREATE SEQUENCE IF NOT EXISTS public.fv_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL DEFAULT 'FV-' || lpad(nextval('public.fv_number_seq')::text, 5, '0'),
  ot_id          UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  client_id      UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name    TEXT,
  net_amount     NUMERIC(16,2) NOT NULL DEFAULT 0,   -- neto (whole pesos)
  tax_amount     NUMERIC(16,2) NOT NULL DEFAULT 0,   -- IVA 19%
  total_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,   -- neto + IVA
  status         public.sales_invoice_status NOT NULL DEFAULT 'issued',
  issued_date    DATE NOT NULL DEFAULT current_date,
  due_date       DATE,
  paid_date      DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_ot     ON public.sales_invoices(ot_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_client ON public.sales_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON public.sales_invoices(status);

-- ─── Guía de Despacho ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.gd_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.dispatch_guides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_number  TEXT UNIQUE NOT NULL DEFAULT 'GD-' || lpad(nextval('public.gd_number_seq')::text, 5, '0'),
  ot_id         UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name   TEXT,
  quantity      INTEGER NOT NULL DEFAULT 0,  -- units in this shipment (partial OK)
  dispatch_date DATE NOT NULL DEFAULT current_date,
  carrier       TEXT,                        -- transportista
  vehicle_plate TEXT,                        -- patente
  received_by   TEXT,
  status        public.dispatch_status NOT NULL DEFAULT 'dispatched',
  invoice_id    UUID REFERENCES public.sales_invoices(id) ON DELETE SET NULL,  -- billed on
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_guides_ot      ON public.dispatch_guides(ot_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_guides_invoice ON public.dispatch_guides(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_guides_status  ON public.dispatch_guides(status);

-- ─── updated_at triggers ─────────────────────────────────────
DROP TRIGGER IF EXISTS update_sales_invoices_updated_at ON public.sales_invoices;
CREATE TRIGGER update_sales_invoices_updated_at
BEFORE UPDATE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_dispatch_guides_updated_at ON public.dispatch_guides;
CREATE TRIGGER update_dispatch_guides_updated_at
BEFORE UPDATE ON public.dispatch_guides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS (authenticated read, ops manage) ────────────────────
ALTER TABLE public.sales_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view facturas venta" ON public.sales_invoices;
CREATE POLICY "Authenticated can view facturas venta"
ON public.sales_invoices FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Ops roles manage facturas venta" ON public.sales_invoices;
CREATE POLICY "Ops roles manage facturas venta"
ON public.sales_invoices FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated can view guias" ON public.dispatch_guides;
CREATE POLICY "Authenticated can view guias"
ON public.dispatch_guides FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Ops roles manage guias" ON public.dispatch_guides;
CREATE POLICY "Ops roles manage guias"
ON public.dispatch_guides FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

-- ─── Fulfillment roll-up (dispatched vs ordered, invoiced vs quoted) ──
CREATE OR REPLACE VIEW public.ot_fulfillment AS
SELECT
  o.id                              AS ot_id,
  o.ot_number,
  o.client_name,
  o.status,
  o.quantity                        AS ordered_qty,
  COALESCE(o.total_price, 0)        AS quoted_price,
  COALESCE(d.dispatched_qty, 0)     AS dispatched_qty,
  COALESCE(d.guide_count, 0)        AS guide_count,
  COALESCE(s.invoiced_total, 0)     AS invoiced_total,
  COALESCE(s.paid_total, 0)         AS paid_total,
  CASE WHEN o.quantity > 0
       THEN ROUND(100.0 * COALESCE(d.dispatched_qty, 0) / o.quantity, 1)
       ELSE 0 END                   AS dispatched_pct
FROM public.ots o
LEFT JOIN (
  SELECT ot_id, SUM(quantity) AS dispatched_qty, COUNT(*) AS guide_count
  FROM public.dispatch_guides WHERE status <> 'cancelled' GROUP BY ot_id
) d ON d.ot_id = o.id
LEFT JOIN (
  SELECT ot_id,
         SUM(total_amount)                                  AS invoiced_total,
         SUM(total_amount) FILTER (WHERE status = 'paid')   AS paid_total
  FROM public.sales_invoices WHERE status <> 'cancelled' GROUP BY ot_id
) s ON s.ot_id = o.id;

COMMENT ON TABLE public.dispatch_guides IS
  'Guía de Despacho: a (possibly partial) shipment of an OT to its client. Forward FSSC traceability OT→client.';
COMMENT ON TABLE public.sales_invoices IS
  'Factura de venta (DTE): bills one or more guías de despacho for an OT. Revenue realization vs the quoted price.';
COMMENT ON VIEW public.ot_fulfillment IS
  'Per-OT fulfillment: dispatched vs ordered units, invoiced/paid vs quoted price.';

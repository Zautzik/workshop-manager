-- ============================================================
-- P1.1 — Procurement: Órden de Compra (OC) + Factura de compra + ledger feed
--
-- Today `purchases` is a flat FSSC record (supplier, date, total). This turns it
-- into a real OC with a lifecycle and an OT link, adds the supplier invoice
-- (factura de compra) it gets reconciled against, and feeds the result into the
-- unified cost ledger — so "buy paper for OT-40497" shows on that OT's costs:
--
--   OC placed (sent/received) → ot_cost_lines.kind = 'committed' (on order)
--   factura matched/paid      → ot_cost_lines.kind = 'actual'    (real cost)
--
-- The ledger already anticipated this: source='purchase', ref_type='oc'.
-- Sync is an explicit function (sync_purchase_ledger), called from the API —
-- mirroring convert_vb_to_ot / feed_whatsapp_to_real_costs (no hidden triggers).
--
-- Additive + idempotent. Apply, then regenerate types.ts.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oc_status') THEN
    CREATE TYPE public.oc_status AS ENUM
      ('draft', 'sent', 'received', 'invoiced', 'closed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factura_compra_status') THEN
    CREATE TYPE public.factura_compra_status AS ENUM
      ('received', 'matched', 'disputed', 'paid');
  END IF;
END $$;

-- ─── purchases → OC (lifecycle + OT link + correlative number) ──
CREATE SEQUENCE IF NOT EXISTS public.oc_number_seq START 1;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS oc_number     TEXT,
  ADD COLUMN IF NOT EXISTS ot_id         UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status        public.oc_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS expected_date DATE,
  ADD COLUMN IF NOT EXISTS notes         TEXT;

-- Backfill: number any OC lacking one; treat pre-existing purchases as received
-- historical goods (not drafts).
UPDATE public.purchases
   SET oc_number = 'OC-' || lpad(nextval('public.oc_number_seq')::text, 5, '0')
 WHERE oc_number IS NULL;
UPDATE public.purchases SET status = 'received'
 WHERE status = 'draft' AND created_at < now() - interval '1 minute';

-- New OCs auto-number from the same sequence.
ALTER TABLE public.purchases
  ALTER COLUMN oc_number SET DEFAULT 'OC-' || lpad(nextval('public.oc_number_seq')::text, 5, '0');

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_oc_number ON public.purchases(oc_number);
CREATE INDEX IF NOT EXISTS idx_purchases_ot     ON public.purchases(ot_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);

COMMENT ON COLUMN public.purchases.ot_id IS
  'OT this OC buys materials for (NULL = stock purchase, not charged to an OT).';

-- ─── Factura de compra (supplier invoice) ────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date   DATE NOT NULL DEFAULT current_date,
  amount         NUMERIC(16,2) NOT NULL DEFAULT 0,   -- whole pesos (CLP, no cents shown)
  status         public.factura_compra_status NOT NULL DEFAULT 'received',
  matched_at     TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_purchase ON public.purchase_invoices(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status   ON public.purchase_invoices(status);

DROP TRIGGER IF EXISTS update_purchase_invoices_updated_at ON public.purchase_invoices;
CREATE TRIGGER update_purchase_invoices_updated_at
BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.purchase_invoices IS
  'Factura de compra (supplier invoice) reconciled against an OC (purchases). On match/paid, sync_purchase_ledger turns the OC''s committed cost into an actual cost on the linked OT.';

-- ─── RLS (mirror ot_cost_lines: authenticated read, ops manage) ──
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view facturas compra" ON public.purchase_invoices;
CREATE POLICY "Authenticated can view facturas compra"
ON public.purchase_invoices FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ops roles manage facturas compra" ON public.purchase_invoices;
CREATE POLICY "Ops roles manage facturas compra"
ON public.purchase_invoices FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

-- ─── Ledger feed: OC → committed, matched factura → actual ───
CREATE OR REPLACE FUNCTION public.sync_purchase_ledger(p_purchase_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_p              public.purchases%ROWTYPE;
  v_matched_amount NUMERIC;
  v_inv_number     TEXT;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id;
  IF v_p.id IS NULL THEN RETURN; END IF;

  -- One ledger line per OC — clear it, then re-derive (idempotent re-sync).
  DELETE FROM public.ot_cost_lines WHERE ref_type = 'oc' AND ref_id = p_purchase_id;

  -- Stock purchases (no OT) or draft/cancelled OCs don't charge an OT.
  IF v_p.ot_id IS NULL OR v_p.status IN ('draft', 'cancelled') THEN
    RETURN;
  END IF;

  -- A matched/paid factura realizes the actual cost; else the OC is committed.
  SELECT amount, invoice_number
    INTO v_matched_amount, v_inv_number
    FROM public.purchase_invoices
   WHERE purchase_id = p_purchase_id AND status IN ('matched', 'paid')
   ORDER BY matched_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_matched_amount IS NOT NULL THEN
    INSERT INTO public.ot_cost_lines
      (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
    VALUES
      (v_p.ot_id, 'actual', 'material', 'purchase',
       'Factura ' || COALESCE(v_inv_number, '') || ' — ' || COALESCE(v_p.supplier, ''),
       1, 'factura', v_matched_amount, 'oc', p_purchase_id, now());
  ELSE
    INSERT INTO public.ot_cost_lines
      (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
    VALUES
      (v_p.ot_id, 'committed', 'material', 'purchase',
       COALESCE(v_p.oc_number, 'OC') || ' — ' || COALESCE(v_p.supplier, ''),
       1, 'OC', COALESCE(v_p.total_cost, 0), 'oc', p_purchase_id, now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_purchase_ledger TO authenticated;

-- ─── Convenience view for the Compras UI (OC + OT + billing state) ──
CREATE OR REPLACE VIEW public.oc_billing AS
SELECT
  p.id,
  p.oc_number,
  p.ot_id,
  o.ot_number,
  p.supplier,
  p.supplier_rut,
  p.status,
  p.purchase_date,
  p.expected_date,
  p.total_cost,
  p.notes,
  p.created_at,
  COALESCE(inv.invoiced_total, 0)                     AS invoiced_total,
  COALESCE(inv.invoice_count, 0)                      AS invoice_count,
  COALESCE(inv.matched_count, 0)                      AS matched_count,
  COALESCE(p.total_cost, 0) - COALESCE(inv.invoiced_total, 0) AS variance
FROM public.purchases p
LEFT JOIN public.ots o ON o.id = p.ot_id
LEFT JOIN LATERAL (
  SELECT
    SUM(amount)                                            AS invoiced_total,
    COUNT(*)                                               AS invoice_count,
    COUNT(*) FILTER (WHERE status IN ('matched', 'paid'))  AS matched_count
  FROM public.purchase_invoices pi
  WHERE pi.purchase_id = p.id
) inv ON TRUE;

COMMENT ON VIEW public.oc_billing IS
  'OC roll-up for Compras: OC + linked OT + invoiced total / match state / variance (total_cost - invoiced).';

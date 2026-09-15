-- La factura se cierra con nombre y motivo cuando hay diferencia
--
-- El PATCH de /invoices/[invoiceId] podía marcar cualquier factura
-- «matched»/«paid» sin mirar el calce: nada impedía cerrar sobre una
-- diferencia real, y ninguna de las tres personas del flujo (recorded_by) era
-- distinta de quien aprobaba, porque no había quien aprobara.
--
-- `ot_cost_lines.approved_by` existe desde el ledger de costos (L1, junio) y
-- nunca se escribe — el control parecía existir y no existía. No se activa ahí
-- porque esa fila la borra y re-crea `sync_purchase_ledger` cada vez que se
-- resincroniza: no es un lugar durable para guardar una decisión humana. Se
-- activa donde la decisión realmente se toma —al cerrar la factura— y desde
-- ahí se hereda hacia la línea del libro, que es la primera vez que esa
-- columna carga un valor real.
--
-- No se exige que quien aprueba sea distinto de quien registró la factura: en
-- un taller donde cuentas por pagar es una sola persona, esa regla no produce
-- control, produce una sesión compartida. Lo que sí se exige —y vive en la
-- base, no sólo en la API, siguiendo el mismo criterio que `cert_override_reason`
-- y `voided_reason`— es nombre y motivo cuando se cierra sobre una diferencia.

BEGIN;

-- ─── 1 · La factura sabe quién la cerró y por qué ──────────────────────────
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

COMMENT ON COLUMN purchase_invoices.approved_by IS
  'Quién marcó la factura matched/paid. Se registra siempre que se cierra, con o sin diferencia.';
COMMENT ON COLUMN purchase_invoices.closure_reason IS
  'Por qué se cerró (matched/paid) una factura cuyo calce mostraba con_diferencia. Obligatorio sólo en ese caso — ver facturas_diferencia_exige_motivo.';

DO $$ BEGIN
  ALTER TABLE purchase_invoices ADD CONSTRAINT facturas_diferencia_exige_motivo
    CHECK (
      status NOT IN ('matched', 'paid')
      OR match_status IS DISTINCT FROM 'con_diferencia'
      OR (closure_reason IS NOT NULL AND btrim(closure_reason) <> '')
    )
    NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ─── 2 · El libro hereda quién aprobó ───────────────────────────────────────
--
-- `sync_purchase_ledger` borra y re-crea la línea 'actual' cada resincronía:
-- es el punto exacto donde `approved_by` se perdía. Ahora la línea nace con el
-- autor de la factura que la originó.
CREATE OR REPLACE FUNCTION public.sync_purchase_ledger(p_purchase_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_p              public.purchases%ROWTYPE;
  v_matched_amount NUMERIC;
  v_inv_number     TEXT;
  v_approved_by    UUID;
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
  SELECT amount, invoice_number, approved_by
    INTO v_matched_amount, v_inv_number, v_approved_by
    FROM public.purchase_invoices
   WHERE purchase_id = p_purchase_id AND status IN ('matched', 'paid')
   ORDER BY matched_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_matched_amount IS NOT NULL THEN
    INSERT INTO public.ot_cost_lines
      (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at, approved_by)
    VALUES
      (v_p.ot_id, 'actual', 'material', 'purchase',
       'Factura ' || COALESCE(v_inv_number, '') || ' — ' || COALESCE(v_p.supplier, ''),
       1, 'factura', v_matched_amount, 'oc', p_purchase_id, now(), v_approved_by);
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

COMMIT;

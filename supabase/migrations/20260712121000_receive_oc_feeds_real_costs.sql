-- ============================================================
-- P2.3 (demo-readiness plan §Phase 2) — OC receipt feeds the cost engine
--
-- The flagship promise is "todo alimenta el motor de costos", yet a received
-- OC — the plant's single biggest cost event (paper) — never became an actual
-- cost on its OT: the 2026-07 audit received $2,3M of cartulina against an OT
-- and cost-analysis kept showing total_actual = 0.
--
-- receive_oc_into_lot() now also inserts an ot_real_costs line when the OC is
-- linked to an OT:
--   * workflow_step = 'oc_receipt' — deliberately NOT an OT status: the manual
--     real-costs dialog records under ot.status and its replace deletes by
--     step, so a distinct key keeps auto lines safe from manual corrections.
--   * operation_code = the lot number (one line per received lot; repeated
--     receipts append, they don't overwrite).
--   * p_recorded_by (new optional param) carries the acting user from the API.
--
-- Signature change is backward-compatible (new param has a DEFAULT).
-- ============================================================

-- The 7-arg predecessor must go first: CREATE OR REPLACE with a DIFFERENT
-- parameter list creates an overload instead of replacing, and two overloads
-- make every unqualified GRANT/COMMENT/RPC reference ambiguous (42725).
DROP FUNCTION IF EXISTS public.receive_oc_into_lot(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.receive_oc_into_lot(
  p_purchase_id  UUID,
  p_item_id      UUID,
  p_quantity     NUMERIC,
  p_unit_cost    NUMERIC DEFAULT NULL,
  p_lot_number   TEXT    DEFAULT NULL,
  p_cert_code    TEXT    DEFAULT NULL,
  p_cert_expires DATE    DEFAULT NULL,
  p_recorded_by  UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p          public.purchases%ROWTYPE;
  v_item       public.inventory_items%ROWTYPE;
  v_lot_id     UUID;
  v_lot_number TEXT;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'OC no encontrada: %', p_purchase_id;
  END IF;
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el material recibido.';
  END IF;
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Material no encontrado: %', p_item_id;
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad recibida inválida.';
  END IF;

  -- Auto lot number from the OC when none is supplied.
  v_lot_number := COALESCE(NULLIF(p_lot_number, ''),
                           COALESCE(v_p.oc_number, 'OC') || '-L' || to_char(now(), 'HH24MISS'));

  -- The received lot, linked back to its OC (FSSC one-up traceability).
  -- Born at 0 available: the purchase transaction below is the single writer
  -- (trg_sync_inventory_lot_quantities adds it), so availability = ledger.
  INSERT INTO public.inventory_lots (
    item_id, lot_number, purchase_id, supplier_name, received_date,
    unit_cost, quantity_received, quantity_available,
    certification_code, certification_expires_on
  ) VALUES (
    p_item_id, v_lot_number, p_purchase_id, v_p.supplier, CURRENT_DATE,
    COALESCE(p_unit_cost, 0), p_quantity, 0,
    p_cert_code, p_cert_expires
  )
  RETURNING id INTO v_lot_id;

  -- Stock movement (purchase) referencing the OC number — this credits the lot.
  INSERT INTO public.inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes
  ) VALUES (
    p_item_id, v_lot_id, 'purchase', p_quantity, COALESCE(p_unit_cost, 0),
    v_p.oc_number, 'Recepción de ' || COALESCE(v_p.oc_number, 'OC')
  );

  -- Feed the cost engine: material received for an OT is an actual cost, now.
  IF v_p.ot_id IS NOT NULL THEN
    INSERT INTO public.ot_real_costs (
      ot_id, workflow_step, operation_code, description, category,
      quantity, unit, unit_cost, recorded_by, notes
    ) VALUES (
      v_p.ot_id, 'oc_receipt', v_lot_number,
      'Recepción ' || COALESCE(v_p.oc_number, 'OC') || ' — ' || v_item.name,
      'materiales',
      p_quantity, COALESCE(v_item.unit, 'unit'), COALESCE(p_unit_cost, 0),
      p_recorded_by,
      'Automático: recepción de OC en bodega (lote ' || v_lot_number || ')'
    );
  END IF;

  -- Advance the OC (only from pre-receipt states) and keep its ledger line in sync.
  UPDATE public.purchases
     SET status = 'received'
   WHERE id = p_purchase_id AND status IN ('draft', 'sent');

  PERFORM public.sync_purchase_ledger(p_purchase_id);

  RETURN v_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_oc_into_lot(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.receive_oc_into_lot(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID) IS
  'Receive a material from an OC into a new inventory_lot (born at 0, ledger credits it), record the stock tx, feed ot_real_costs when the OC is OT-linked, and advance the OC to received.';

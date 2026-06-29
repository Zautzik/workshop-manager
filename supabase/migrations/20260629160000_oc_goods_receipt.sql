-- ============================================================
-- W1.1 — Goods receipt against an OC (the OC → lote link)
--
-- The WhatsApp/QR warehouse capture already creates lots + stock transactions
-- (feed_warehouse_to_inventory). What was missing: tying a receipt back to the
-- P1 Órden de Compra, so the FSSC chain OC → lote → OT is whole.
--
-- receive_oc_into_lot() receives a material from an OC into a new inventory_lot
-- carrying purchase_id (one-up traceability), records the stock movement, and
-- advances the OC to 'received'. Header-level: one lot per call, the operator
-- confirms which material/qty arrived (lots are per-item, item_id is NOT NULL).
--
-- Additive + idempotent (CREATE OR REPLACE). Mirrors the explicit-RPC style.
-- ============================================================

CREATE OR REPLACE FUNCTION public.receive_oc_into_lot(
  p_purchase_id  UUID,
  p_item_id      UUID,
  p_quantity     NUMERIC,
  p_unit_cost    NUMERIC DEFAULT NULL,
  p_lot_number   TEXT    DEFAULT NULL,
  p_cert_code    TEXT    DEFAULT NULL,
  p_cert_expires DATE    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p          public.purchases%ROWTYPE;
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
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad recibida inválida.';
  END IF;

  -- Auto lot number from the OC when none is supplied.
  v_lot_number := COALESCE(NULLIF(p_lot_number, ''),
                           COALESCE(v_p.oc_number, 'OC') || '-L' || to_char(now(), 'HH24MISS'));

  -- The received lot, linked back to its OC (FSSC one-up traceability).
  INSERT INTO public.inventory_lots (
    item_id, lot_number, purchase_id, supplier_name, received_date,
    unit_cost, quantity_received, quantity_available,
    certification_code, certification_expires_on
  ) VALUES (
    p_item_id, v_lot_number, p_purchase_id, v_p.supplier, CURRENT_DATE,
    COALESCE(p_unit_cost, 0), p_quantity, p_quantity,
    p_cert_code, p_cert_expires
  )
  RETURNING id INTO v_lot_id;

  -- Stock movement (purchase) referencing the OC number.
  INSERT INTO public.inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes
  ) VALUES (
    p_item_id, v_lot_id, 'purchase', p_quantity, COALESCE(p_unit_cost, 0),
    v_p.oc_number, 'Recepción de ' || COALESCE(v_p.oc_number, 'OC')
  );

  -- Advance the OC (only from pre-receipt states) and keep its ledger line in sync.
  UPDATE public.purchases
     SET status = 'received'
   WHERE id = p_purchase_id AND status IN ('draft', 'sent');

  PERFORM public.sync_purchase_ledger(p_purchase_id);

  RETURN v_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_oc_into_lot TO authenticated;

COMMENT ON FUNCTION public.receive_oc_into_lot IS
  'Receive a material from an OC into a new inventory_lot (purchase_id set), record the stock tx, and advance the OC to received. Completes the FSSC OC→lote→OT chain.';

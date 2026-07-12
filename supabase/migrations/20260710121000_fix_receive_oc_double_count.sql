-- ============================================================
-- Fix P1.2 (demo-readiness plan §Phase 1) — OC receipt doubles inventory
--
-- receive_oc_into_lot() inserted the lot with quantity_available = p_quantity
-- AND recorded a 'purchase' stock transaction of the same amount. The trigger
-- trg_sync_inventory_lot_quantities adds every purchase tx to the lot again,
-- so every goods receipt landed at exactly 2× the received quantity
-- (verified live: received 1.620 → lot showed 3.240).
--
-- Fix: the lot is born with quantity_available = 0; the stock transaction is
-- the single writer of availability (same contract the WhatsApp warehouse
-- flow relies on). quantity_received keeps the real received amount.
--
-- Repair: recompute quantity_available from the transaction ledger — but only
-- for lots that were created by this function (purchase_id set) AND have
-- transactions. Seed lots inserted directly without a ledger are left alone.
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
  'Receive a material from an OC into a new inventory_lot (purchase_id set). The lot starts at 0 and the purchase stock tx credits it via trigger — single-writer, no double count.';

-- ─── Repair: correct lots doubled by the old function ─────────────────────
-- Only lots created through an OC receipt (purchase_id set) that have a
-- transaction ledger. Their true availability is the sum of tx deltas.
UPDATE public.inventory_lots l
SET quantity_available = tx.balance
FROM (
  SELECT
    t.lot_id,
    SUM(
      CASE
        WHEN t.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN t.quantity
        WHEN t.tx_type IN ('consumption', 'adjustment_out') THEN -t.quantity
        ELSE 0
      END
    ) AS balance
  FROM public.inventory_stock_transactions t
  GROUP BY t.lot_id
) tx
WHERE tx.lot_id = l.id
  AND l.purchase_id IS NOT NULL
  AND l.quantity_available <> tx.balance;

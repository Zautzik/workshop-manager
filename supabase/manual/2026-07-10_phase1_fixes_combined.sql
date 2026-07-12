-- ============================================================
-- Fix P1.1 (demo-readiness plan §Phase 1) — convert_vb_to_ot() 500s
--
-- vistos_buenos stores product_type / substrate_type / color_front /
-- color_back as TEXT, but the matching ots columns are enums. In plpgsql a
-- typed TEXT variable does NOT auto-coerce into an enum column (string
-- literals do), so every conversion failed with:
--   column "product_type" is of type ot_product_type but expression is of type text
--
-- Fix: validate each TEXT value against the enum labels and cast explicitly.
-- Invalid legacy values raise a clear Spanish error instead of a raw cast
-- failure. Otherwise identical to 20260628150000_convert_vb_to_ot.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.convert_vb_to_ot(p_vb_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vb        public.vistos_buenos%ROWTYPE;
  v_ot_id     UUID;
  v_ot_number TEXT;
  v_next      BIGINT;
  v_line      JSONB;
  v_product   public.ot_product_type;
  v_substrate public.ot_substrate_type;
  v_c_front   public.ot_color_mode;
  v_c_back    public.ot_color_mode;
BEGIN
  SELECT * INTO v_vb FROM public.vistos_buenos WHERE id = p_vb_id;
  IF v_vb.id IS NULL THEN
    RAISE EXCEPTION 'Visto Bueno no encontrado: %', p_vb_id;
  END IF;

  -- Idempotent: already converted → return the existing OT.
  IF v_vb.status = 'converted' AND v_vb.ot_id IS NOT NULL THEN
    RETURN v_vb.ot_id;
  END IF;

  IF v_vb.status <> 'signed' THEN
    RAISE EXCEPTION 'El Visto Bueno debe estar firmado (estado actual: %)', v_vb.status;
  END IF;

  -- TEXT → enum, with a readable error when a legacy value doesn't match.
  BEGIN
    v_product   := v_vb.product_type::public.ot_product_type;
    v_substrate := v_vb.substrate_type::public.ot_substrate_type;
    v_c_front   := v_vb.color_front::public.ot_color_mode;
    v_c_back    := v_vb.color_back::public.ot_color_mode;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'El Visto Bueno tiene un valor no reconocido (producto: %, sustrato: %, colores: %/%). Corrígelo antes de convertir.',
      v_vb.product_type, v_vb.substrate_type, v_vb.color_front, v_vb.color_back;
  END;

  -- Next correlative OT number (OT-NNNNN); ignore the legacy OT-YYYY-NNN format.
  SELECT COALESCE(MAX(substring(ot_number from 4)::bigint), 40500) + 1
    INTO v_next
  FROM public.ots
  WHERE ot_number ~ '^OT-[0-9]+$';
  v_ot_number := 'OT-' || v_next;

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    subtotal, margin_pct, total_price, unit_price, status, notes
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'visto_bueno', v_vb.notes
  )
  RETURNING id INTO v_ot_id;

  -- Freeze the estimate into the unified cost ledger (source = 'vb').
  IF v_vb.estimate_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_vb.estimate_lines) LOOP
      INSERT INTO public.ot_cost_lines (ot_id, kind, category, source, description, quantity, unit, unit_cost)
      VALUES (
        v_ot_id, 'estimate',
        (CASE WHEN v_line->>'category' IN ('material','labor','machine','finishing','outsourced','overhead','other')
              THEN v_line->>'category' ELSE 'other' END)::public.cost_line_category,
        'vb',
        COALESCE(v_line->>'description', 'Línea de costo'),
        COALESCE((v_line->>'quantity')::numeric, 0),
        COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'unit_cost')::numeric, 0)
      );
    END LOOP;
  END IF;

  UPDATE public.vistos_buenos
     SET status = 'converted', ot_id = v_ot_id, updated_at = now()
   WHERE id = p_vb_id;

  RETURN v_ot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_vb_to_ot TO authenticated;
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
-- ============================================================
-- Fix P1.1b — convert_vb_to_ot(): normalize legacy VB color notation
--
-- The VB form stores color_front / color_back as bare digit strings
-- ('4', '2', '0' — count of inks per side), but ots.color_front/back are
-- ot_color_mode enums. The cast guard added in 20260710120000 correctly
-- rejected them ("valor no reconocido"), which blocked converting every
-- seeded VB. Map digits → enum here; proper enum labels still pass through.
--   0 → sin_impresion · 1 → 1_color · 2 → 2_color · 3 → 3_color
--   4 → cmyk · 5 → cmyk_pantone
-- ============================================================

CREATE OR REPLACE FUNCTION public.convert_vb_to_ot(p_vb_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vb        public.vistos_buenos%ROWTYPE;
  v_ot_id     UUID;
  v_ot_number TEXT;
  v_next      BIGINT;
  v_line      JSONB;
  v_product   public.ot_product_type;
  v_substrate public.ot_substrate_type;
  v_c_front   public.ot_color_mode;
  v_c_back    public.ot_color_mode;
BEGIN
  SELECT * INTO v_vb FROM public.vistos_buenos WHERE id = p_vb_id;
  IF v_vb.id IS NULL THEN
    RAISE EXCEPTION 'Visto Bueno no encontrado: %', p_vb_id;
  END IF;

  -- Idempotent: already converted → return the existing OT.
  IF v_vb.status = 'converted' AND v_vb.ot_id IS NOT NULL THEN
    RETURN v_vb.ot_id;
  END IF;

  IF v_vb.status <> 'signed' THEN
    RAISE EXCEPTION 'El Visto Bueno debe estar firmado (estado actual: %)', v_vb.status;
  END IF;

  -- TEXT → enum, normalizing the VB form's digit notation for colors.
  BEGIN
    v_product   := v_vb.product_type::public.ot_product_type;
    v_substrate := v_vb.substrate_type::public.ot_substrate_type;
    v_c_front := CASE COALESCE(TRIM(v_vb.color_front), '')
      WHEN ''  THEN NULL
      WHEN '0' THEN 'sin_impresion'
      WHEN '1' THEN '1_color'
      WHEN '2' THEN '2_color'
      WHEN '3' THEN '3_color'
      WHEN '4' THEN 'cmyk'
      WHEN '5' THEN 'cmyk_pantone'
      ELSE v_vb.color_front::public.ot_color_mode
    END;
    v_c_back := CASE COALESCE(TRIM(v_vb.color_back), '')
      WHEN ''  THEN NULL
      WHEN '0' THEN 'sin_impresion'
      WHEN '1' THEN '1_color'
      WHEN '2' THEN '2_color'
      WHEN '3' THEN '3_color'
      WHEN '4' THEN 'cmyk'
      WHEN '5' THEN 'cmyk_pantone'
      ELSE v_vb.color_back::public.ot_color_mode
    END;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'El Visto Bueno tiene un valor no reconocido (producto: %, sustrato: %, colores: %/%). Corrígelo antes de convertir.',
      v_vb.product_type, v_vb.substrate_type, v_vb.color_front, v_vb.color_back;
  END;

  -- Next correlative OT number (OT-NNNNN); ignore the legacy OT-YYYY-NNN format.
  SELECT COALESCE(MAX(substring(ot_number from 4)::bigint), 40500) + 1
    INTO v_next
  FROM public.ots
  WHERE ot_number ~ '^OT-[0-9]+$';
  v_ot_number := 'OT-' || v_next;

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    subtotal, margin_pct, total_price, unit_price, status, notes
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'visto_bueno', v_vb.notes
  )
  RETURNING id INTO v_ot_id;

  -- Freeze the estimate into the unified cost ledger (source = 'vb').
  IF v_vb.estimate_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_vb.estimate_lines) LOOP
      INSERT INTO public.ot_cost_lines (ot_id, kind, category, source, description, quantity, unit, unit_cost)
      VALUES (
        v_ot_id, 'estimate',
        (CASE WHEN v_line->>'category' IN ('material','labor','machine','finishing','outsourced','overhead','other')
              THEN v_line->>'category' ELSE 'other' END)::public.cost_line_category,
        'vb',
        COALESCE(v_line->>'description', 'Línea de costo'),
        COALESCE((v_line->>'quantity')::numeric, 0),
        COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'unit_cost')::numeric, 0)
      );
    END LOOP;
  END IF;

  UPDATE public.vistos_buenos
     SET status = 'converted', ot_id = v_ot_id, updated_at = now()
   WHERE id = p_vb_id;

  RETURN v_ot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_vb_to_ot TO authenticated;

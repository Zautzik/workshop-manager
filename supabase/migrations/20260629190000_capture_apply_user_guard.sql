-- ============================================================
-- CAP1.2 — apply_capture_event: NULL-guard the reviewer FK
--
-- The router stamped created_by/recorded_by = reviewed_by. Under the dev bypass
-- (and any non-auth context) reviewed_by is the nil UUID, which is not a real
-- auth.users row → FK violation on inventory_stock_transactions.created_by /
-- ot_real_costs.recorded_by. Resolve a SAFE user (NULL when it isn't a real
-- auth user) before writing those columns. Idempotent CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_capture_event(p_event_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e       public.capture_events%ROWTYPE;
  v_user    UUID;
  v_costs   JSONB;
  v_line    JSONB;
  v_tx_type public.inventory_tx_type;
  v_qty     NUMERIC;
  v_cost    NUMERIC;
  v_lot_id  UUID;
  v_tx_id   UUID;
BEGIN
  SELECT * INTO v_e FROM public.capture_events WHERE id = p_event_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Capture no encontrada: %', p_event_id; END IF;
  IF v_e.status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'La captura debe estar aprobada antes de aplicarse (estado: %)', v_e.status;
  END IF;
  IF v_e.applied THEN RAISE EXCEPTION 'La captura ya fue aplicada'; END IF;

  -- Only reference the reviewer if it's a real auth user (dev bypass = nil UUID).
  SELECT id INTO v_user FROM auth.users WHERE id = v_e.reviewed_by;

  IF v_e.domain = 'production' THEN
    v_costs := COALESCE(v_e.corrected_costs, v_e.inferred_costs);
    IF v_costs IS NULL OR v_costs->'cost_lines' IS NULL THEN
      RAISE EXCEPTION 'Sin datos de costo para aplicar';
    END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines') LOOP
      INSERT INTO public.ot_real_costs
        (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, recorded_by, notes)
      VALUES (
        v_e.ot_id, 'whatsapp_report', 'WA-' || LEFT(v_e.id::TEXT, 8),
        v_line->>'description', COALESCE(v_line->>'category', 'otros'),
        COALESCE((v_line->>'quantity')::NUMERIC, 0), COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'unit_cost')::NUMERIC, 0), v_user,
        'Registrado vía captura por ' || COALESCE(v_e.operator_name, v_e.operator_phone)
      );
    END LOOP;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'real_cost', updated_at = now()
     WHERE id = p_event_id;
    RETURN p_event_id;

  ELSIF v_e.domain = 'warehouse' THEN
    IF v_e.item_id IS NULL THEN RAISE EXCEPTION 'Captura sin material vinculado'; END IF;
    CASE v_e.event_type
      WHEN 'receive' THEN v_tx_type := 'purchase';
      WHEN 'use'     THEN v_tx_type := 'consumption';
      WHEN 'return'  THEN v_tx_type := 'return_to_stock';
      ELSE RAISE EXCEPTION 'Acción % no se puede aplicar a inventario', v_e.event_type;
    END CASE;

    v_qty  := v_e.quantity;
    v_cost := v_e.unit_cost;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    v_lot_id := v_e.lot_id;
    IF v_lot_id IS NULL THEN
      SELECT id INTO v_lot_id FROM public.inventory_lots
       WHERE item_id = v_e.item_id AND quantity_available > 0
       ORDER BY received_date DESC LIMIT 1;
    END IF;
    IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
      INSERT INTO public.inventory_lots
        (item_id, lot_number, purchase_id, supplier_name, received_date, unit_cost, quantity_received, quantity_available)
      VALUES (v_e.item_id, 'CAP-' || to_char(now(), 'YYYYMMDD-HH24MI'), v_e.purchase_id, NULL, CURRENT_DATE,
              COALESCE(v_cost, 0), v_qty, v_qty)
      RETURNING id INTO v_lot_id;
    END IF;
    IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay lote para el material %', v_e.item_id; END IF;

    INSERT INTO public.inventory_stock_transactions
      (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_by)
    VALUES (v_e.item_id, v_lot_id, v_e.ot_id, v_tx_type, v_qty, v_cost,
            'CAP-' || v_e.id::TEXT, COALESCE(v_e.review_comments, 'Vía captura'), v_user)
    RETURNING id INTO v_tx_id;

    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'inventory_tx', applied_ref_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
     WHERE id = p_event_id;
    RETURN v_tx_id;

  ELSE
    RAISE EXCEPTION 'Dominio % aún no soportado por el router', v_e.domain;
  END IF;
END;
$$;

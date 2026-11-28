-- Un solo almacén para el costo real: el libro (ot_cost_lines).
--
-- Decisión del dueño (2026-11-27, B7 de plan.md): la carga manual del costo
-- real queda como CORRECCIÓN en el libro (src/lib/cost-correction.ts), no en
-- una segunda tabla. Hasta hoy:
--   - el diálogo del Tablero escribía ot_real_costs y un disparador
--     (sync_real_cost_to_ledger) lo copiaba a ot_cost_lines;
--   - apply_capture_event escribía ahí las líneas extra de un parte revisado;
--   - el análisis de costo de Rentabilidad y la compuerta de despacho leían
--     SÓLO ot_real_costs, que tiene 1 fila — lo real de hoy no aparecía y
--     ninguna OT nueva podía despacharse (arreglado en bed02e0).
--
-- Esta migración:
--   1. apply_capture_event escribe las líneas extra directo al libro
--      (ref_type 'capture', ref_id = la captura). El resto de la función no
--      cambia: es la definición viva, con ese único bloque reemplazado.
--   2. Quita los disparadores de copia y sus funciones.
--   3. Borra ot_real_costs. Su única fila ya está en el libro (ref_type
--      'ot_real_cost'), que se queda: es historia.


CREATE OR REPLACE FUNCTION public.apply_capture_event(p_event_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e        public.capture_events%ROWTYPE;
  v_by       UUID;
  v_user     UUID;
  v_legacy   BOOLEAN := false;
  v_costs    JSONB;
  v_line     JSONB;
  v_ref      TEXT;
  v_origin   TEXT;
  v_tx_type  public.inventory_tx_type;
  v_lot_id   UUID;
  v_tx_id    UUID;
  v_supplier TEXT;
  v_consumo  JSONB;
BEGIN
  SELECT * INTO v_e FROM public.capture_events WHERE id = p_event_id FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Captura no encontrada: %', p_event_id; END IF;
  IF v_e.status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'La captura debe estar aprobada antes de aplicarse (estado: %)', v_e.status;
  END IF;

  IF v_e.legacy_table = 'whatsapp_production_logs' THEN
    SELECT fed_to_system INTO v_legacy FROM public.whatsapp_production_logs WHERE id = v_e.legacy_id FOR UPDATE;
  ELSIF v_e.legacy_table = 'whatsapp_warehouse_logs' THEN
    SELECT fed_to_inventory, supplier_name INTO v_legacy, v_supplier
      FROM public.whatsapp_warehouse_logs WHERE id = v_e.legacy_id FOR UPDATE;
  END IF;
  IF v_e.applied OR COALESCE(v_legacy, false) THEN
    RAISE EXCEPTION 'La captura ya fue aplicada';
  END IF;

  v_by := COALESCE(p_actor, v_e.reviewed_by);
  SELECT id INTO v_user FROM auth.users WHERE id = v_by;

  v_ref    := LEFT(COALESCE(v_e.legacy_id, v_e.id)::TEXT, 8);
  v_origin := CASE v_e.channel::TEXT WHEN 'whatsapp' THEN 'WhatsApp' ELSE 'captura' END;

  IF v_e.domain = 'production' THEN
    IF v_e.ot_id IS NULL THEN RAISE EXCEPTION 'La captura no tiene OT: no hay a dónde cargar el costo'; END IF;
    v_costs := COALESCE(v_e.corrected_costs, v_e.inferred_costs, '{}'::jsonb);

    -- Ni material ni máquina. El papel y la tinta entran cuando salen de
    -- bodega, al costo de su lote; la máquina, cuando se cierra la pasada
    -- (horas, o clics en digital) — y el parte ya alimenta esa pasada con sus
    -- horas y pliegos. Una línea acá los contaría otra vez y a otro precio. Las
    -- capturas viejas que todavía traen esas líneas se aplican sin ellas.
    -- Un parte sin líneas es válido: su valor es la cantidad y el avance.
    -- Material, máquina y mano de obra salen del consumo y de la pasada, no del parte.
    IF jsonb_typeof(v_costs->'cost_lines') = 'array' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines') LOOP
        CONTINUE WHEN public.map_real_cost_category(COALESCE(v_line->>'category', 'otros')) IN ('material', 'machine', 'labor');
        -- Directo al libro (2026-11-27): antes iba a ot_real_costs y un
        -- disparador lo copiaba acá. ref_id = la captura que lo trajo.
        INSERT INTO public.ot_cost_lines
          (ot_id, kind, category, description, quantity, unit, unit_cost,
           occurred_at, recorded_by, source, ref_type, ref_id, notes)
        VALUES (
          v_e.ot_id, 'actual', public.map_real_cost_category(COALESCE(v_line->>'category', 'otros')),
          v_line->>'description',
          COALESCE((v_line->>'quantity')::NUMERIC, 0), COALESCE(v_line->>'unit', 'unit'),
          COALESCE((v_line->>'unit_cost')::NUMERIC, 0),
          now(), v_user, 'whatsapp_report', 'capture', v_e.id,
          'WA-' || v_ref || ' — registrado vía ' || v_origin || ' por ' || COALESCE(v_e.operator_name, v_e.operator_phone, 'operario')
        );
      END LOOP;
    END IF;

    IF v_e.legacy_table = 'whatsapp_production_logs' THEN
      UPDATE public.whatsapp_production_logs SET fed_to_system = true, updated_at = now() WHERE id = v_e.legacy_id;
    END IF;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'real_cost', updated_at = now()
     WHERE id = p_event_id;
    RETURN p_event_id;

  ELSIF v_e.domain = 'warehouse' THEN
    IF v_e.item_id IS NULL AND v_e.lot_id IS NULL THEN RAISE EXCEPTION 'Captura sin material vinculado'; END IF;
    CASE v_e.event_type
      WHEN 'receive' THEN v_tx_type := 'purchase';
      WHEN 'use'     THEN v_tx_type := 'consumption';
      WHEN 'return'  THEN v_tx_type := 'return_to_stock';
      ELSE
        -- El escaneo QR de un lote siempre es un consumo.
        IF v_e.channel::TEXT = 'qr' THEN v_tx_type := 'consumption';
        ELSE RAISE EXCEPTION 'Acción % no se puede aplicar a inventario', v_e.event_type; END IF;
    END CASE;
    IF v_e.quantity IS NULL OR v_e.quantity <= 0 THEN RAISE EXCEPTION 'Cantidad inválida — corregila antes de aprobar.'; END IF;
    IF v_e.channel::TEXT = 'qr' AND v_e.ot_id IS NULL THEN
      RAISE EXCEPTION 'Falta la OT — corregila antes de aprobar.';
    END IF;

    -- Consumo contra una OT: SIEMPRE por consumir_lote, venga de un QR, una
    -- foto o un WhatsApp. Antes la rama sin QR insertaba el consumo directo,
    -- sin retención, saldo, reserva ni certificado, y tomaba el lote MÁS
    -- NUEVO; el backflush toma el más viejo. Ahora: el lote que se nombró, o
    -- el reservado para esta OT, o el más viejo con saldo — la misma regla
    -- que backflush.
    IF v_tx_type = 'consumption' AND v_e.ot_id IS NOT NULL THEN
      v_lot_id := v_e.lot_id;
      IF v_lot_id IS NULL THEN
        SELECT l.id INTO v_lot_id
          FROM public.inventory_lots l
          LEFT JOIN public.inventory_reservations r
            ON r.lot_id = l.id AND r.ot_id = v_e.ot_id AND r.status = 'activa' AND r.expires_at > now()
         WHERE l.item_id = v_e.item_id AND l.quantity_available > 0 AND l.blocked_reason IS NULL
         ORDER BY (r.id IS NULL), l.received_date ASC, l.created_at ASC
         LIMIT 1;
      END IF;
      IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay un lote con saldo de ese material. Recibilo en bodega primero.'; END IF;

      v_consumo := public.consumir_lote(v_lot_id, v_e.ot_id, v_e.quantity, v_user,
                     CASE WHEN v_e.channel::TEXT = 'qr' THEN 'foto_bodega' ELSE 'captura_' || v_e.channel::TEXT END, NULL);
      v_tx_id := (v_consumo->>'tx_id')::UUID;
    ELSE
      v_lot_id := v_e.lot_id;
      IF v_lot_id IS NULL THEN
        SELECT id INTO v_lot_id FROM public.inventory_lots
         WHERE item_id = v_e.item_id AND quantity_available > 0
         ORDER BY received_date ASC, created_at ASC LIMIT 1;
      END IF;
      IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
        INSERT INTO public.inventory_lots
          (item_id, lot_number, purchase_id, supplier_name, received_date, unit_cost, oc_unit_cost, quantity_received, quantity_available)
        VALUES (v_e.item_id, 'WA-' || to_char(now(), 'YYYYMMDD-HH24MI'), v_e.purchase_id, v_supplier, CURRENT_DATE,
                COALESCE(v_e.unit_cost, 0), COALESCE(v_e.unit_cost, 0), v_e.quantity, v_e.quantity)
        RETURNING id INTO v_lot_id;
      END IF;
      IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay lote para el material %. Creá un lote primero.', v_e.item_id; END IF;

      -- Una devolución con OT acredita a esa OT al costo de su lote (trigger);
      -- un consumo sin OT es gasto general de bodega y no toca ninguna OT.
      INSERT INTO public.inventory_stock_transactions
        (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_by)
      SELECT l.item_id, l.id, v_e.ot_id, v_tx_type, v_e.quantity,
             CASE WHEN v_tx_type = 'purchase' THEN COALESCE(v_e.unit_cost, l.unit_cost) ELSE l.unit_cost END,
             CASE WHEN v_e.legacy_id IS NOT NULL THEN 'WA-WH-' || v_e.legacy_id::TEXT ELSE 'CAP-' || v_e.id::TEXT END,
             COALESCE(v_e.review_comments, 'Vía ' || v_origin || ' bodega'), v_user
        FROM public.inventory_lots l WHERE l.id = v_lot_id
      RETURNING id INTO v_tx_id;
    END IF;

    IF v_e.legacy_table = 'whatsapp_warehouse_logs' THEN
      UPDATE public.whatsapp_warehouse_logs
         SET fed_to_inventory = true, inventory_tx_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
       WHERE id = v_e.legacy_id;
    END IF;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'inventory_tx', applied_ref_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
     WHERE id = p_event_id;
    RETURN v_tx_id;

  ELSE
    RAISE EXCEPTION 'Dominio % no soportado', v_e.domain;
  END IF;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_real_cost_to_ledger ON public.ot_real_costs;
DROP TRIGGER IF EXISTS trg_unsync_real_cost_from_ledger ON public.ot_real_costs;
DROP FUNCTION IF EXISTS public.sync_real_cost_to_ledger();
DROP FUNCTION IF EXISTS public.unsync_real_cost_from_ledger();

DROP TABLE IF EXISTS public.ot_real_costs;


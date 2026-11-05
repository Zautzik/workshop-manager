-- Un solo escritor para todo parte: apply_capture_event
--
-- ── El hilo dorado tenía tres escritores ────────────────────────────────────
--
-- Un parte aprobado se convertía en plata o en inventario por tres funciones
-- distintas, según qué pantalla lo aprobaba:
--
--   feed_whatsapp_to_real_costs(log_id)   — pantalla de WhatsApp, producción
--   feed_warehouse_to_inventory(log_id)   — rutas de bodega
--   apply_capture_event(event_id)         — bandeja de Capturas, ambos dominios
--
-- Cada una miraba sólo su propio guardia (`fed_to_system`, `fed_to_inventory`,
-- `applied`) y ninguna marcaba el de las otras. El espejo legado → capture_events
-- es de una sola vía, así que aprobar en Capturas dejaba el log sin marcar y la
-- otra pantalla volvía a cargar el mismo parte — con otro operation_code, de
-- modo que ni siquiera se veía como duplicado (H2/H3, plan 1D,
-- docs/capture-local-plan-2026-10-09.md).
--
-- ── Ahora hay uno ───────────────────────────────────────────────────────────
--
-- `apply_capture_event(p_event_id, p_actor)` es el único camino de un parte
-- aprobado al sistema, para producción y para bodega, entre por donde entre:
--
--   * mira AMBOS guardias (el de la captura y el del log de origen), con la
--     fila bloqueada, así que dos aprobaciones simultáneas no pueden aplicar
--     dos veces;
--   * aplica con el dato corregido (el espejo ya copia corrected_* a la
--     captura);
--   * marca el log de origen, y el espejo devuelve `applied = true` a la
--     captura — los dos guardias quedan de acuerdo;
--   * la foto/QR de un lote trazable pasa por consumir_lote (reserva,
--     certificado, retención), que antes se elegía en TypeScript;
--   * el operation_code usa el id del log de origen cuando existe, el mismo
--     que ya escribía feed_whatsapp_to_real_costs: las filas viejas y las
--     nuevas de un mismo parte se reconocen entre sí.
--
-- Las dos funciones específicas se eliminan: un nombre como
-- «feed_whatsapp_to_real_costs» es una puerta lateral, y una puerta lateral
-- es por donde vuelve a entrar el doble conteo.
--
-- ── Datos ───────────────────────────────────────────────────────────────────
--
-- Los partes que el router viejo aplicó sin marcar el log quedan marcados acá,
-- copiando también la decisión de la captura al log: el UPDATE dispara el
-- espejo, y sin eso el espejo devolvería la captura a `pending`.
--
-- ── Para revertir ───────────────────────────────────────────────────────────
--
-- Las definiciones anteriores están en 20260410120000 (feed_whatsapp_to_real_costs),
-- 20260420120000 (feed_warehouse_to_inventory) y 20260629190000
-- (apply_capture_event de un argumento). Recrearlas y volver a llamarlas desde
-- src/lib/capture-review.ts.

BEGIN;

-- ── 1. Reconciliar lo aplicado por la otra puerta ──────────────────────────

UPDATE public.whatsapp_production_logs l
   SET fed_to_system   = true,
       review_status   = c.status::text::public.whatsapp_review_status,
       reviewed_by     = c.reviewed_by,
       reviewed_at     = c.reviewed_at,
       review_comments = c.review_comments,
       corrected_data  = COALESCE(c.corrected_data, l.corrected_data),
       corrected_costs = COALESCE(c.corrected_costs, l.corrected_costs),
       updated_at      = now()
  FROM public.capture_events c
 WHERE c.legacy_table = 'whatsapp_production_logs'
   AND c.legacy_id    = l.id
   AND c.applied
   AND NOT l.fed_to_system;

UPDATE public.whatsapp_warehouse_logs l
   SET fed_to_inventory   = true,
       inventory_tx_id    = COALESCE(l.inventory_tx_id, c.applied_ref_id),
       review_status      = c.status::text::public.warehouse_review_status,
       reviewed_by        = c.reviewed_by,
       reviewed_at        = c.reviewed_at,
       review_comments    = c.review_comments,
       corrected_quantity = CASE WHEN c.quantity IS DISTINCT FROM l.quantity THEN c.quantity ELSE l.corrected_quantity END,
       updated_at         = now()
  FROM public.capture_events c
 WHERE c.legacy_table = 'whatsapp_warehouse_logs'
   AND c.legacy_id    = l.id
   AND c.applied
   AND NOT l.fed_to_inventory;

-- ── 2. El escritor ─────────────────────────────────────────────────────────

-- Firma nueva: con un DEFAULT, CREATE OR REPLACE crearía una sobrecarga y la
-- llamada de un argumento quedaría ambigua.
DROP FUNCTION IF EXISTS public.apply_capture_event(UUID);

CREATE FUNCTION public.apply_capture_event(p_event_id UUID, p_actor UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
BEGIN
  SELECT * INTO v_e FROM public.capture_events WHERE id = p_event_id FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Captura no encontrada: %', p_event_id; END IF;
  IF v_e.status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'La captura debe estar aprobada antes de aplicarse (estado: %)', v_e.status;
  END IF;

  -- Los dos guardias, con el log de origen también bloqueado.
  IF v_e.legacy_table = 'whatsapp_production_logs' THEN
    SELECT fed_to_system INTO v_legacy FROM public.whatsapp_production_logs WHERE id = v_e.legacy_id FOR UPDATE;
  ELSIF v_e.legacy_table = 'whatsapp_warehouse_logs' THEN
    SELECT fed_to_inventory, supplier_name INTO v_legacy, v_supplier
      FROM public.whatsapp_warehouse_logs WHERE id = v_e.legacy_id FOR UPDATE;
  END IF;
  IF v_e.applied OR COALESCE(v_legacy, false) THEN
    RAISE EXCEPTION 'La captura ya fue aplicada';
  END IF;

  -- Quién aprueba. Sólo se referencia si es un usuario real de auth (la sesión
  -- de desarrollo usa el UUID nulo).
  v_by := COALESCE(p_actor, v_e.reviewed_by);
  SELECT id INTO v_user FROM auth.users WHERE id = v_by;

  v_ref    := LEFT(COALESCE(v_e.legacy_id, v_e.id)::TEXT, 8);
  v_origin := CASE v_e.channel::TEXT WHEN 'whatsapp' THEN 'WhatsApp' ELSE 'captura' END;

  IF v_e.domain = 'production' THEN
    IF v_e.ot_id IS NULL THEN RAISE EXCEPTION 'La captura no tiene OT: no hay a dónde cargar el costo'; END IF;
    v_costs := COALESCE(v_e.corrected_costs, v_e.inferred_costs);
    IF v_costs IS NULL OR jsonb_typeof(v_costs->'cost_lines') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Sin datos de costo para aplicar';
    END IF;

    -- total_cost es columna generada (quantity × unit_cost): ningún total que
    -- venga en el JSON llega al libro.
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines') LOOP
      INSERT INTO public.ot_real_costs
        (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, recorded_by, notes)
      VALUES (
        v_e.ot_id, 'whatsapp_report', 'WA-' || v_ref,
        v_line->>'description', COALESCE(v_line->>'category', 'otros'),
        COALESCE((v_line->>'quantity')::NUMERIC, 0), COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'unit_cost')::NUMERIC, 0), v_user,
        'Registrado vía ' || v_origin || ' por ' || COALESCE(v_e.operator_name, v_e.operator_phone, 'operario')
      );
    END LOOP;

    IF v_e.legacy_table = 'whatsapp_production_logs' THEN
      UPDATE public.whatsapp_production_logs SET fed_to_system = true, updated_at = now() WHERE id = v_e.legacy_id;
    END IF;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'real_cost', updated_at = now()
     WHERE id = p_event_id;
    RETURN p_event_id;

  ELSIF v_e.domain = 'warehouse' THEN
    -- Un lote trazable escaneado entra por consumir_lote, como cualquier otro
    -- consumo de lote: ahí viven la reserva, el certificado y la retención.
    -- Su mensaje de error ya está escrito para una persona y se propaga tal cual.
    IF v_e.channel::TEXT = 'qr' AND v_e.lot_id IS NOT NULL THEN
      IF v_e.ot_id IS NULL OR v_e.quantity IS NULL THEN
        RAISE EXCEPTION 'Falta la OT o la cantidad — corregilas antes de aprobar.';
      END IF;
      PERFORM public.consumir_lote(v_e.lot_id, v_e.ot_id, v_e.quantity, v_by, 'foto_bodega', NULL);
      UPDATE public.capture_events
         SET applied = true, applied_ref_type = 'inventory_tx', updated_at = now()
       WHERE id = p_event_id;
      RETURN p_event_id;
    END IF;

    IF v_e.item_id IS NULL THEN RAISE EXCEPTION 'Captura sin material vinculado'; END IF;
    CASE v_e.event_type
      WHEN 'receive' THEN v_tx_type := 'purchase';
      WHEN 'use'     THEN v_tx_type := 'consumption';
      WHEN 'return'  THEN v_tx_type := 'return_to_stock';
      ELSE RAISE EXCEPTION 'Acción % no se puede aplicar a inventario', v_e.event_type;
    END CASE;
    -- quantity/unit_cost ya traen la corrección: el espejo copia
    -- COALESCE(corrected_*, original) a la captura.
    IF v_e.quantity IS NULL OR v_e.quantity <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    v_lot_id := v_e.lot_id;
    IF v_lot_id IS NULL THEN
      SELECT id INTO v_lot_id FROM public.inventory_lots
       WHERE item_id = v_e.item_id AND quantity_available > 0
       ORDER BY received_date DESC LIMIT 1;
    END IF;
    IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
      INSERT INTO public.inventory_lots
        (item_id, lot_number, purchase_id, supplier_name, received_date, unit_cost, quantity_received, quantity_available)
      VALUES (v_e.item_id, 'WA-' || to_char(now(), 'YYYYMMDD-HH24MI'), v_e.purchase_id, v_supplier, CURRENT_DATE,
              COALESCE(v_e.unit_cost, 0), v_e.quantity, v_e.quantity)
      RETURNING id INTO v_lot_id;
    END IF;
    IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay lote para el material %. Creá un lote primero.', v_e.item_id; END IF;

    INSERT INTO public.inventory_stock_transactions
      (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_by)
    VALUES (v_e.item_id, v_lot_id, v_e.ot_id, v_tx_type, v_e.quantity, v_e.unit_cost,
            CASE WHEN v_e.legacy_id IS NOT NULL THEN 'WA-WH-' || v_e.legacy_id::TEXT ELSE 'CAP-' || v_e.id::TEXT END,
            COALESCE(v_e.review_comments, 'Vía ' || v_origin || ' bodega'), v_user)
    RETURNING id INTO v_tx_id;

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
$$;

COMMENT ON FUNCTION public.apply_capture_event(UUID, UUID) IS
  'Único camino de un parte aprobado al sistema (costos reales o inventario), para todas las pantallas. Mira y marca los dos guardias: capture_events.applied y el fed_* del log de origen.';

-- Sólo el servidor (service_role) la llama, como el resto desde 20261014122000.
REVOKE ALL ON FUNCTION public.apply_capture_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_capture_event(UUID, UUID) TO service_role;

-- ── 3. Las puertas laterales ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.feed_whatsapp_to_real_costs(UUID);
DROP FUNCTION IF EXISTS public.feed_warehouse_to_inventory(UUID);

COMMIT;

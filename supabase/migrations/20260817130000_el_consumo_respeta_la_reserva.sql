-- El consumo respeta la reserva
--
-- Reservar no sirve si el consumo no la mira. Dos cosas que tiene que hacer y
-- antes no hacía:
--
--   1. NO dejar que una OT se lleve papel comprometido con otra. Sin esto la
--      reserva es un post-it: informa y no protege.
--
--   2. Consumir la propia. Si la OT reservó 3.000 pliegos, sacarlos tiene que
--      cerrar esa reserva — si no, el papel sale de bodega y sigue figurando
--      comprometido, que es la forma de que el estante quede bloqueado por
--      trabajos que ya se hicieron.
--
-- El orden importa: primero se descuenta de lo propio, y sólo lo que exceda
-- compite contra lo libre. Al revés, una OT que reservó bien no podría consumir
-- lo suyo cuando el resto del lote está tomado.

BEGIN;

CREATE OR REPLACE FUNCTION public.consumir_lote(
  p_lot_id           UUID,
  p_ot_id            UUID,
  p_quantity         NUMERIC,
  p_by               UUID DEFAULT NULL,
  p_stage            TEXT DEFAULT NULL,
  p_override_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_lot      public.inventory_lots%ROWTYPE;
  v_item     public.inventory_items%ROWTYPE;
  v_ot       public.ots%ROWTYPE;
  v_req      public.certification_requirements%ROWTYPE;
  v_vence    DATE;
  v_dias     INTEGER;
  v_desvio   BOOLEAN := false;
  v_propia   NUMERIC := 0;
  v_ajena    NUMERIC := 0;
  v_libre    NUMERIC;
BEGIN
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote. El código puede estar borroso.';
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  SELECT * INTO v_item FROM inventory_items WHERE id = v_lot.item_id;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  IF COALESCE(v_lot.quantity_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'El lote % tiene % disponible y estás sacando %.',
      v_lot.lot_number, COALESCE(v_lot.quantity_available, 0), p_quantity;
  END IF;

  -- ── Lo comprometido ──────────────────────────────────────────────────────
  SELECT COALESCE(SUM(quantity) FILTER (WHERE ot_id = p_ot_id), 0),
         COALESCE(SUM(quantity) FILTER (WHERE ot_id <> p_ot_id), 0)
    INTO v_propia, v_ajena
    FROM inventory_reservations
   WHERE lot_id = p_lot_id AND status = 'activa' AND expires_at > now();

  -- Lo propio sale primero; sólo el excedente compite contra lo libre.
  v_libre := COALESCE(v_lot.quantity_available, 0) - v_ajena;
  IF p_quantity > v_libre THEN
    RAISE EXCEPTION
      'Del lote % hay % sin comprometer: el resto está reservado para otra orden.',
      v_lot.lot_number, GREATEST(v_libre, 0);
  END IF;

  SELECT * INTO v_req FROM certification_requirements
   WHERE material_category = lower(COALESCE(v_item.category::text, ''));
  IF v_req.id IS NULL THEN
    SELECT * INTO v_req FROM certification_requirements WHERE material_category IS NULL;
  END IF;

  IF COALESCE(v_item.is_certification_required, false) THEN
    v_vence := v_lot.certification_expires_on;

    IF v_vence IS NULL THEN
      IF COALESCE(btrim(p_override_reason), '') = '' THEN
        RAISE EXCEPTION
          'El lote % no tiene certificado y % lo exige. Hace falta autorización de %.',
          v_lot.lot_number, COALESCE(v_item.name, 'este material'),
          COALESCE(v_req.override_role, 'Calidad');
      END IF;
      v_desvio := true;
    ELSE
      v_dias := v_vence - CURRENT_DATE;
      IF v_dias < COALESCE(v_req.min_days_valid_at_use, 0) THEN
        IF COALESCE(btrim(p_override_reason), '') = '' THEN
          RAISE EXCEPTION
            'El certificado del lote % venció el %. No puede ir a producción sin autorización de %.',
            v_lot.lot_number, to_char(v_vence, 'DD-MM-YYYY'),
            COALESCE(v_req.override_role, 'Calidad');
        END IF;
        v_desvio := true;
      END IF;
    END IF;
  END IF;

  INSERT INTO inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost,
    work_order_id, reference_code, notes, created_by,
    authorized_deviation, deviation_reason
  ) VALUES (
    v_lot.item_id, p_lot_id, 'consumption', p_quantity, COALESCE(v_lot.unit_cost, 0),
    p_ot_id, v_lot.lot_number, COALESCE(p_stage, 'consumo'), p_by,
    v_desvio,
    CASE WHEN v_desvio THEN btrim(p_override_reason) END
  );

  -- ── Cerrar la reserva propia ─────────────────────────────────────────────
  --
  -- Si se consumió todo lo reservado, la reserva se cierra. Si se consumió
  -- parte, se reduce: lo que queda sigue comprometido porque el trabajo todavía
  -- lo necesita. Dejarla intacta bloquearía papel ya consumido.
  IF v_propia > 0 THEN
    IF p_quantity >= v_propia THEN
      UPDATE inventory_reservations
         SET status = 'consumida', released_at = now()
       WHERE ot_id = p_ot_id AND lot_id = p_lot_id AND status = 'activa';
    ELSE
      UPDATE inventory_reservations
         SET quantity = quantity - p_quantity
       WHERE ot_id = p_ot_id AND lot_id = p_lot_id AND status = 'activa';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lot_number', v_lot.lot_number,
    'material', v_item.name,
    'ot_number', v_ot.ot_number,
    'quantity', p_quantity,
    'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'reserved_before', v_propia,
    'cert_expires', v_lot.certification_expires_on,
    'override', v_desvio
  );
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.consumir_lote(UUID, UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

COMMIT;

-- «50.000» no son cincuenta mil
--
-- Los mensajes de las funciones interpolaban un NUMERIC directo, y Postgres lo
-- imprime con sus decimales: `50` sale como «50.000». En español el punto es
-- separador de miles, así que el operario lee CINCUENTA MIL donde hay cincuenta.
--
-- En un mensaje sobre cuánto papel queda, eso no es un detalle de formato: es la
-- diferencia entre parar y seguir cortando. Se redondea a entero antes de
-- interpolar — las cantidades de pliegos no tienen decimales de todos modos.

BEGIN;

CREATE OR REPLACE FUNCTION public.reservar_lote(
  p_lot_id   UUID,
  p_ot_id    UUID,
  p_quantity NUMERIC,
  p_by       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_lot   public.inventory_lots%ROWTYPE;
  v_ot    public.ots%ROWTYPE;
  v_libre NUMERIC;
  v_vence TIMESTAMPTZ;
  v_id    UUID;
BEGIN
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote.';
  END IF;
  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  SELECT COALESCE(v_lot.quantity_available, 0) - COALESCE(SUM(quantity), 0)
    INTO v_libre
    FROM inventory_reservations
   WHERE lot_id = p_lot_id AND status = 'activa' AND expires_at > now()
     AND ot_id <> p_ot_id;

  IF v_libre < p_quantity THEN
    RAISE EXCEPTION
      'El lote % tiene % pliegos libres: el resto está comprometido con otras órdenes.',
      v_lot.lot_number, round(GREATEST(v_libre, 0))::BIGINT;
  END IF;

  v_vence := GREATEST(
    COALESCE(v_ot.deadline::timestamptz, now()) + INTERVAL '7 days',
    now() + INTERVAL '7 days'
  );

  INSERT INTO inventory_reservations (lot_id, ot_id, quantity, expires_at, created_by)
  VALUES (p_lot_id, p_ot_id, p_quantity, v_vence, p_by)
  ON CONFLICT (ot_id, lot_id) WHERE status = 'activa'
  DO UPDATE SET quantity = EXCLUDED.quantity, expires_at = EXCLUDED.expires_at
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id, 'lot_number', v_lot.lot_number, 'ot_number', v_ot.ot_number,
    'quantity', p_quantity, 'expires_at', v_vence
  );
END;
$BODY$;

-- El consumo tiene tres mensajes con el mismo problema.
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
  v_lot     public.inventory_lots%ROWTYPE;
  v_item    public.inventory_items%ROWTYPE;
  v_ot      public.ots%ROWTYPE;
  v_req     public.certification_requirements%ROWTYPE;
  v_vence   DATE;
  v_dias    INTEGER;
  v_desvio  BOOLEAN := false;
  v_propia  NUMERIC := 0;
  v_ajena   NUMERIC := 0;
  v_libre   NUMERIC;
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
    RAISE EXCEPTION 'El lote % tiene % pliegos y estás sacando %.',
      v_lot.lot_number, round(COALESCE(v_lot.quantity_available, 0))::BIGINT, round(p_quantity)::BIGINT;
  END IF;

  SELECT COALESCE(SUM(quantity) FILTER (WHERE ot_id = p_ot_id), 0),
         COALESCE(SUM(quantity) FILTER (WHERE ot_id <> p_ot_id), 0)
    INTO v_propia, v_ajena
    FROM inventory_reservations
   WHERE lot_id = p_lot_id AND status = 'activa' AND expires_at > now();

  v_libre := COALESCE(v_lot.quantity_available, 0) - v_ajena;
  IF p_quantity > v_libre THEN
    RAISE EXCEPTION
      'Del lote % hay % pliegos sin comprometer: el resto está reservado para otra orden.',
      v_lot.lot_number, round(GREATEST(v_libre, 0))::BIGINT;
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
    v_desvio, CASE WHEN v_desvio THEN btrim(p_override_reason) END
  );

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
    'lot_number', v_lot.lot_number, 'material', v_item.name, 'ot_number', v_ot.ot_number,
    'quantity', p_quantity, 'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'reserved_before', v_propia, 'cert_expires', v_lot.certification_expires_on, 'override', v_desvio
  );
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.reservar_lote(UUID, UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_lote(UUID, UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

COMMIT;

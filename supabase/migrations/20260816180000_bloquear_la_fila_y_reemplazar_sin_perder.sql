-- Bloquear la fila, y reemplazar sin perder
--
-- Dos defectos encontrados revisando lo de hoy. Los dos son de concurrencia y
-- por eso ninguno aparece probando a mano: hacen falta dos personas al mismo
-- tiempo, que es exactamente lo que pasa en un taller y nunca en una demo.
--
-- 1. `consumir_lote` leía el saldo, verificaba que alcanzara, y recién después
--    insertaba. Sin bloqueo, dos consumos simultáneos del mismo lote leen el
--    MISMO saldo, los dos pasan la verificación, y el lote queda en negativo.
--    Un pallet consumido dos veces es justo lo que rompe un inventario que se
--    supone trazable — y peor: nadie lo nota hasta el conteo.
--
-- 2. Reemplazar los requisitos de una OT eran dos operaciones sueltas desde la
--    API: borrar todo, después insertar. Si el insert fallaba —una violación de
--    CHECK, un corte— los requisitos quedaban BORRADOS y los nuevos no habían
--    entrado. El usuario veía un error y había perdido la lista.
--
--    Acá adentro las dos son una sola transacción: si algo falla, no se borró
--    nada. Y de paso se detecta la edición simultánea, que antes pisaba en
--    silencio al que había guardado primero.

BEGIN;

-- ─── 1 · El consumo bloquea el lote ─────────────────────────────────────────
--
-- Sólo cambia una línea de la función —el `FOR UPDATE`— pero hay que reescribir
-- el cuerpo entero porque plpgsql no se parchea por partes. El resto es
-- idéntico a la versión anterior.
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
  v_lot    public.inventory_lots%ROWTYPE;
  v_item   public.inventory_items%ROWTYPE;
  v_ot     public.ots%ROWTYPE;
  v_req    public.certification_requirements%ROWTYPE;
  v_vence  DATE;
  v_dias   INTEGER;
  v_desvio BOOLEAN := false;
BEGIN
  -- FOR UPDATE: el segundo consumo espera acá hasta que el primero termine, y
  -- entonces lee el saldo YA descontado. Es la diferencia entre dos personas
  -- sacando papel del mismo pallet y dos personas sacando el mismo papel.
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

  RETURN jsonb_build_object(
    'lot_number', v_lot.lot_number,
    'material', v_item.name,
    'ot_number', v_ot.ot_number,
    'quantity', p_quantity,
    'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'cert_expires', v_lot.certification_expires_on,
    'override', v_desvio
  );
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.consumir_lote(UUID, UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

-- ─── 2 · Reemplazar los requisitos, o no tocar nada ─────────────────────────
CREATE OR REPLACE FUNCTION public.reemplazar_requisitos(
  p_ot_id    UUID,
  p_filas    JSONB,
  p_by       UUID DEFAULT NULL,
  -- Lo que el cliente vio al abrir. Si en el medio alguien guardó, esto no
  -- coincide y se rechaza en vez de pisarlo.
  p_visto_en TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_actual TIMESTAMPTZ;
  v_n      INTEGER;
BEGIN
  -- Se bloquean las filas de esta OT antes de mirar nada: si dos guardan a la
  -- vez, el segundo espera y ve el estado real, no el que leyó hace un minuto.
  PERFORM 1 FROM ot_requirements WHERE ot_id = p_ot_id FOR UPDATE;

  SELECT max(updated_at) INTO v_actual FROM ot_requirements WHERE ot_id = p_ot_id;

  IF p_visto_en IS NOT NULL AND v_actual IS NOT NULL AND v_actual > p_visto_en THEN
    RAISE EXCEPTION
      'Alguien más guardó esta lista mientras la editabas. Recargá para no pisarle el trabajo.'
      USING ERRCODE = '40001';
  END IF;

  DELETE FROM ot_requirements WHERE ot_id = p_ot_id;

  INSERT INTO ot_requirements (
    ot_id, kind, description, item_id, quantity, unit,
    source, purchase_id, lot_id, status, notes, resolved_at, resolved_by
  )
  SELECT
    p_ot_id,
    f->>'kind',
    f->>'description',
    NULLIF(f->>'item_id', '')::UUID,
    NULLIF(f->>'quantity', '')::NUMERIC,
    NULLIF(f->>'unit', ''),
    f->>'source',
    CASE WHEN f->>'source' = 'comprar' THEN NULLIF(f->>'purchase_id', '')::UUID END,
    CASE WHEN f->>'source' = 'bodega'  THEN NULLIF(f->>'lot_id', '')::UUID END,
    COALESCE(f->>'status', 'pendiente'),
    NULLIF(f->>'notes', ''),
    CASE WHEN f->>'status' = 'resuelto' THEN now() END,
    CASE WHEN f->>'status' = 'resuelto' THEN p_by END
  FROM jsonb_array_elements(p_filas) AS f;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('guardados', v_n);
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.reemplazar_requisitos(UUID, JSONB, UUID, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.reemplazar_requisitos IS
  'Borra e inserta los requisitos de una OT en UNA transacción. Si algo falla, no se borró nada; si alguien más guardó en el medio, se rechaza en vez de pisarlo.';

COMMIT;

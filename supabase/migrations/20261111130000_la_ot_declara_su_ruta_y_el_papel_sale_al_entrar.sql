-- La OT declara su ruta, y el papel sale de bodega al entrar a la primera
-- etapa de esa ruta (2026-11-11).
--
-- Regla del dueño: el pliego que la guillotina toma para el primer corte es
-- el mismo que entra a la prensa y el mismo que va al troquel. El papel sale
-- de bodega UNA vez, al entrar a la guillotina; las etapas siguientes mueven
-- esos mismos pliegos. Y no toda OT pasa por todas las etapas del Tablero, así
-- que la ruta se pregunta al crear la OT en vez de adivinarla.
--
-- Una OT sin primer corte (digital, o papel ya cortado) consume al entrar a
-- la primera etapa de su ruta. Lo decide src/lib/paper-issue.ts; la columna
-- sólo guarda la ruta.
--
-- El backflush (descontar los pliegos COTIZADOS al dejar la etapa, en pliegos
-- contra lotes en kg) se retira en la misma entrega: lo reemplaza esta salida
-- declarada.

ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS route_steps TEXT[];

ALTER TABLE public.ots DROP CONSTRAINT IF EXISTS ots_route_steps_validas;
ALTER TABLE public.ots ADD CONSTRAINT ots_route_steps_validas CHECK (
  route_steps IS NULL OR (
    cardinality(route_steps) > 0
    AND route_steps <@ ARRAY[
      'corte_inicial', 'offset', 'digital', 'laminado', 'troquelado', 'corte_final',
      'desglose', 'plegado', 'terminaciones', 'tercerizado', 'revision_etiquetas',
      'embalaje', 'despacho'
    ]::TEXT[]
  )
);

-- Un fragmento (split_ot copia una lista fija de columnas) hereda la ruta del
-- padre: es el mismo trabajo, partido en cantidades.
CREATE OR REPLACE FUNCTION public.fragment_inherits_route() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.route_steps IS NULL AND NEW.ot_number LIKE '%-%' THEN
    SELECT route_steps INTO NEW.route_steps
      FROM public.ots
     WHERE ot_number = split_part(NEW.ot_number, '-', 1)
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fragment_inherits_route ON public.ots;
CREATE TRIGGER trg_fragment_inherits_route
  BEFORE INSERT ON public.ots
  FOR EACH ROW EXECUTE FUNCTION public.fragment_inherits_route();

-- Ninguna máquina descuenta papel sola al dejar la etapa.
UPDATE public.machines SET consumption_mode = 'scan' WHERE consumption_mode = 'backflush';

-- ── La salida de papel: todos los lotes o ninguno ──────────────────────────
-- Una OT puede sacar de dos lotes (el reservado no alcanza). Cada línea pasa
-- por consumir_lote —saldo, reservas ajenas, certificado FSSC, costo del
-- lote— y la función entera es una transacción: si el segundo lote falla, el
-- primero no salió.
--
-- p_lines: [{ "lot_id": uuid, "quantity": numeric (en la unidad del ítem),
--             "override_reason": text|null }]
CREATE OR REPLACE FUNCTION public.emitir_papel(
  p_ot_id UUID, p_lines JSONB, p_by UUID DEFAULT NULL, p_stage TEXT DEFAULT NULL
) RETURNS JSONB
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_line JSONB;
  v_out  JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Falta el papel que sale: al menos un lote.';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_out := v_out || jsonb_build_array(public.consumir_lote(
      (v_line->>'lot_id')::uuid,
      p_ot_id,
      (v_line->>'quantity')::numeric,
      p_by,
      COALESCE(p_stage, 'salida de papel'),
      NULLIF(btrim(COALESCE(v_line->>'override_reason', '')), '')
    ));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Si el papel salió y la OT no pudo moverse (otro la movió al mismo tiempo),
-- el papel vuelve: un movimiento de devolución por cada salida, a la vista en
-- el kardex y acreditado a la OT por trg_cost_ot_material_movement.
CREATE OR REPLACE FUNCTION public.devolver_salida_papel(p_tx_ids UUID[], p_by UUID DEFAULT NULL)
RETURNS INTEGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO inventory_stock_transactions
    (item_id, lot_id, tx_type, quantity, unit_cost, work_order_id, reference_code, notes, created_by)
  SELECT item_id, lot_id, 'return_to_stock', quantity, unit_cost, work_order_id, reference_code,
         'La OT no avanzó: el papel vuelve a bodega', p_by
    FROM inventory_stock_transactions
   WHERE id = ANY(p_tx_ids) AND tx_type = 'consumption';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_papel(UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_papel(UUID, JSONB, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.devolver_salida_papel(UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_salida_papel(UUID[], UUID) TO service_role;

COMMENT ON COLUMN public.ots.route_steps IS
  'Las etapas por las que pasa la OT (claves de PLAN_STEPS, production-route.ts), declaradas al crearla. NULL = OT anterior a 20261111130000: la ruta se deduce de su ficha. El papel sale de bodega al entrar a la primera.';

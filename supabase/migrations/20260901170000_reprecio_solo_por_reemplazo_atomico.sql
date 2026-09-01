-- El precio de una OT dejaba de confiar en sí mismo apenas alguien tocaba
-- ot_operations por cualquier motivo.
--
-- `recalc_ot_subtotal()` corría en CADA insert/update/delete de esa tabla y
-- recalculaba subtotal/total_price desde SUM(ot_operations) tal como
-- estuviera en ese instante -- sin distinguir "esto es un reemplazo
-- completo y deliberado" de "esto es una fila suelta". Confirmado en vivo
-- (auditoría 2026-09-01, "Golden Thread Trace"): una sola fila con
-- quantity=0 -- lo mínimo para satisfacer la compuerta "operaciones
-- revisadas" de Pre-Prensa -- bajó una OT de $1.147.500 a $0, y de ahí pasó
-- visto bueno, seis etapas de planta y llegó a "listo para despacho" sin que
-- ninguna compuerta lo notara (la de desviación de precio sólo mira subas).
--
-- Peor: PATCH /api/ots/[id] reemplaza operaciones con un DELETE y un INSERT
-- como dos llamadas HTTP separadas, no una transacción. Si el INSERT falla
-- después de que el DELETE ya corrió -- una caída de red, lo que sea -- el
-- trigger viejo dejaba el subtotal en cero (0 filas = suma 0) de forma
-- PERMANENTE, y la ruta igual respondía 200 porque trata esa falla como "no
-- fatal". Ese camino no necesitaba que nadie cometiera un error: alcanzaba
-- con mala suerte de red en el momento exacto.
--
-- La regla ahora: el precio sólo se recalcula desde un reemplazo COMPLETO
-- y ATÓMICO de las operaciones, nunca desde una escritura suelta.

DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_insert ON public.ot_operations;
DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_update ON public.ot_operations;
DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_delete ON public.ot_operations;
DROP FUNCTION IF EXISTS public.recalc_ot_subtotal();

-- Reemplaza TODAS las operaciones de una OT y recalcula el precio en la
-- misma transacción: si algo falla a mitad de camino, Postgres deshace todo
-- -- la OT nunca queda con las operaciones borradas y el precio a medio
-- actualizar. Misma fórmula que tenía el trigger, calculada una sola vez en
-- vez de repetida tres veces en línea (menos lugar para un error de
-- transcripción).
CREATE OR REPLACE FUNCTION public.replace_ot_operations(
  p_ot_id      UUID,
  p_operations JSONB
)
RETURNS public.ots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal   NUMERIC(12,2);
  v_margin     NUMERIC(12,2);
  v_increment  NUMERIC(12,2);
  v_commission NUMERIC(12,2);
  v_total      NUMERIC(12,2);
  v_margin_pct     NUMERIC;
  v_increment_pct  NUMERIC;
  v_commission_pct NUMERIC;
  v_quantity   NUMERIC;
  v_row public.ots;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ots WHERE id = p_ot_id) THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  DELETE FROM public.ot_operations WHERE ot_id = p_ot_id;

  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order)
  SELECT
    p_ot_id,
    (r->>'category')::public.ot_operation_category,
    r->>'name',
    COALESCE(r->>'unit', 'unit'),
    COALESCE((r->>'quantity')::numeric, 0),
    COALESCE((r->>'unit_cost')::numeric, 0),
    COALESCE((r->>'sort_order')::int, 0)
  FROM jsonb_array_elements(p_operations) AS r;

  SELECT margin_pct, increment_pct, commission_pct, quantity
    INTO v_margin_pct, v_increment_pct, v_commission_pct, v_quantity
    FROM public.ots WHERE id = p_ot_id;

  SELECT COALESCE(SUM(total_cost), 0) INTO v_subtotal
    FROM public.ot_operations WHERE ot_id = p_ot_id;

  v_margin     := ROUND(v_subtotal * COALESCE(v_margin_pct, 0) / 100, 2);
  v_increment  := ROUND((v_subtotal + v_margin) * COALESCE(v_increment_pct, 0) / 100, 2);
  v_commission := ROUND((v_subtotal + v_margin + v_increment) * COALESCE(v_commission_pct, 0) / 100, 2);
  v_total      := v_subtotal + v_margin + v_increment + v_commission;

  UPDATE public.ots
  SET subtotal = v_subtotal,
      margin_amount = v_margin,
      increment_amount = v_increment,
      commission_amount = v_commission,
      total_price = v_total,
      unit_price = CASE WHEN COALESCE(v_quantity, 0) > 0 THEN ROUND(v_total / v_quantity, 4) ELSE 0 END,
      updated_at = now()
  WHERE id = p_ot_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.replace_ot_operations(UUID, JSONB) IS
  'Único camino que debe recalcular el precio de una OT desde sus operaciones: borra e
   inserta el set completo y recalcula subtotal/margen/incremento/comisión/total en la misma
   transacción. Nada más debe tocar ot_operations y esperar que el precio lo siga solo -- esa
   confianza implícita (un trigger por-fila) es lo que causó el bug de $1.147.500 a $0.';

GRANT EXECUTE ON FUNCTION public.replace_ot_operations(UUID, JSONB) TO authenticated;

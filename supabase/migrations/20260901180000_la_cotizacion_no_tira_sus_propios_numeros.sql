-- La cotización calcula pliegos/kg/planchas/horas EN VIVO y los muestra en
-- el diálogo -- y hasta hoy, esos números morían ahí. `vistos_buenos` no
-- tenía dónde guardarlos, `save()` nunca los mandaba, y `convert_vb_to_ot()`
-- no tenía nada que copiar. Toda OT nacida de Cotización arrancaba con los
-- seis `calc_*` en null, cerrados sólo si alguien abría el asistente de
-- edición, llegaba a la pestaña de Operaciones específicamente, Y apretaba
-- "Recalcular" -- nada lo exige ni lo avisa (auditoría 2026-09-01, "Golden
-- Thread Trace", hallazgo F-2).
--
-- Encontrado siguiéndolo en vivo: el agujero es más profundo todavía.
-- `convert_vb_to_ot()` copia `estimate_lines` a `ot_cost_lines` (el ledger),
-- pero NUNCA a `ot_operations` -- la tabla que de verdad lee la compuerta
-- "operaciones revisadas" y de la que depende `replace_ot_operations()`
-- (ver 20260901170000) para recalcular el precio. Toda OT de Cotización nace
-- con CERO filas en ot_operations, tenga o no estimate_lines: la compuerta
-- de Pre-Prensa se satisface con cualquier fila que alguien ponga ahí,
-- estimada de verdad o inventada para pasar -- que es exactamente cómo
-- apareció el bug de F-1.

ALTER TABLE public.vistos_buenos
  ADD COLUMN IF NOT EXISTS calc_sheets NUMERIC,
  ADD COLUMN IF NOT EXISTS calc_substrate_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS calc_ink_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS calc_plates NUMERIC,
  ADD COLUMN IF NOT EXISTS calc_print_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS calc_finish_hours NUMERIC;

COMMENT ON COLUMN public.vistos_buenos.calc_sheets IS
  'Lo mismo que ots.calc_sheets, calculado por el mismo motor (computeOTCalculations) en el
   diálogo de Cotización. Viaja a la OT en convert_vb_to_ot() -- antes se descartaba.';

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
  v_line      JSONB;
  v_sort      INTEGER := 0;
  v_product   public.ot_product_type;
  v_substrate public.ot_substrate_type;
  v_c_front   public.ot_color_mode;
  v_c_back    public.ot_color_mode;
  v_ink       TEXT;
  v_priority  INTEGER;
BEGIN
  SELECT * INTO v_vb FROM public.vistos_buenos WHERE id = p_vb_id;
  IF v_vb.id IS NULL THEN
    RAISE EXCEPTION 'Visto Bueno no encontrado: %', p_vb_id;
  END IF;

  IF v_vb.status = 'converted' AND v_vb.ot_id IS NOT NULL THEN
    RETURN v_vb.ot_id;
  END IF;

  IF v_vb.status IN ('rejected', 'expired') THEN
    RAISE EXCEPTION 'La cotización está % y no puede generar una orden.', v_vb.status;
  END IF;

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

  v_ink := CASE
    WHEN v_vb.ink_coverage IS NULL THEN NULL
    WHEN lower(trim(v_vb.ink_coverage)) IN ('light','medium','heavy') THEN lower(trim(v_vb.ink_coverage))
    WHEN v_vb.ink_coverage ~ '^[0-9]+' THEN
      CASE
        WHEN (regexp_replace(v_vb.ink_coverage, '[^0-9].*$', ''))::int <= 30 THEN 'light'
        WHEN (regexp_replace(v_vb.ink_coverage, '[^0-9].*$', ''))::int >= 70 THEN 'heavy'
        ELSE 'medium'
      END
    ELSE NULL
  END;

  v_priority := CASE COALESCE(v_vb.priority_level, 'normal')
    WHEN 'baja'    THEN 2
    WHEN 'normal'  THEN 5
    WHEN 'alta'    THEN 8
    WHEN 'urgente' THEN 10
    ELSE 5
  END;

  v_ot_number := public.generate_ot_number();

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    ink_coverage,
    subtotal, margin_pct, total_price, unit_price, status, notes,
    deadline, assigned_machine_id,
    calc_sheets, calc_substrate_kg, calc_ink_kg, calc_plates, calc_print_hours, calc_finish_hours,
    finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz,
    finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion,
    flag_ord, flag_vbp
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, v_priority, COALESCE(v_vb.priority_level, 'normal')::public.ot_priority_level, v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_ink,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'pre_press', v_vb.notes,
    v_vb.deadline,
    v_vb.press_id,
    v_vb.calc_sheets, v_vb.calc_substrate_kg, v_vb.calc_ink_kg, v_vb.calc_plates, v_vb.calc_print_hours, v_vb.calc_finish_hours,
    COALESCE((v_vb.finishes->>'finish_troquelado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_plegado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_pegado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_laminado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_barniz')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_relieve')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_perforado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_hot_stamping')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_uv_localizado')::boolean, FALSE),
    COALESCE((v_vb.finishes->>'finish_numeracion')::boolean, FALSE),
    TRUE, FALSE
  )
  RETURNING id INTO v_ot_id;

  -- Las líneas cotizadas, en las DOS tablas que las necesitan: ot_cost_lines
  -- (el ledger que ya alimentaba Analítica) Y ot_operations (la que de
  -- verdad lee la compuerta "operaciones revisadas" y de la que depende
  -- replace_ot_operations() para recalcular el precio si Pre-Prensa las
  -- ajusta). Antes sólo se llenaba la primera -- la OT llegaba a Pre-Prensa
  -- con cero operaciones reales pase lo que pase.
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

      INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order)
      VALUES (
        v_ot_id,
        (CASE WHEN v_line->>'category' IN ('materiales','impresion','terminaciones','tercerizado','otros')
              THEN v_line->>'category' ELSE 'otros' END)::public.ot_operation_category,
        COALESCE(v_line->>'description', 'Línea de costo'),
        COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'quantity')::numeric, 0),
        COALESCE((v_line->>'unit_cost')::numeric, 0),
        v_sort
      );
      v_sort := v_sort + 1;
    END LOOP;
  END IF;

  UPDATE public.vistos_buenos
     SET status = 'converted', ot_id = v_ot_id, updated_at = now()
   WHERE id = p_vb_id;

  RETURN v_ot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_vb_to_ot TO authenticated;

COMMENT ON FUNCTION public.convert_vb_to_ot IS
  'Convierte un VB firmado en OT. La OT nace en pre_press con flag_ord, priority (numérica) y
   los seis calc_* ya resueltos -- ya no depende de que alguien abra el asistente y apriete
   Recalcular para que existan. Las líneas cotizadas se copian a ot_cost_lines (ledger) Y a
   ot_operations (de la que dependen la compuerta de Pre-Prensa y el precio de la OT).';

-- Una OT nacida de cotización no heredaba `priority` (el entero), sólo
-- `priority_level` (el enum) -- y el tablero ordena por el entero
--
-- Encontrado siguiendo el reclamo "una OT creada por Cotización no trae la
-- misma información que una creada por +Nueva OT" (auditoría 2026-08-30/31).
--
-- `POST /api/ots` (la ruta que usa el asistente +Nueva OT) mapea
-- `priority_level` a un `priority` numérico heredado para que el tablero
-- pueda ordenar (`baja:2, normal:5, alta:8, urgente:10`) -- el propio
-- comentario de esa ruta explica que sin ese mapeo "cada OT 'urgente' cae en
-- prioridad 1" (auditoría 2026-07). `convert_vb_to_ot` nunca hizo ese mapeo:
-- insertaba `priority_level` pero dejaba `priority` en su default de columna.
--
-- El efecto es silencioso y específico: `GET /api/ots` -- lo que lee el
-- Kanban -- ordena `.order('priority', {ascending:false})` primero y
-- `created_at` después. Un vendedor que cotiza un trabajo y lo marca
-- "urgente" ve la orden nacer con la misma prioridad numérica que cualquier
-- otra, y el tablero no la sube. Es exactamente el mismo defecto que motivó
-- el comentario de julio en la ruta REST -- sólo que en el otro camino de
-- creación, sin que nadie lo hubiera revisado ahí también.
--
-- El resto de la función queda idéntico a
-- 20260815130000_la_prioridad_se_heredaba_dos_veces.sql (la última versión
-- viva, según npm run check:migrations).

BEGIN;

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
  v_product   public.ot_product_type;
  v_substrate public.ot_substrate_type;
  v_c_front   public.ot_color_mode;
  v_c_back    public.ot_color_mode;
  v_ink       TEXT;
  -- Mismo mapeo que `POST /api/ots` (priorityMap en src/app/api/ots/route.ts):
  -- una OT nacida de cotización se ordena en el tablero como cualquier otra.
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

COMMENT ON FUNCTION public.convert_vb_to_ot IS
  'Convierte un VB firmado en OT. La OT nace en pre_press con flag_ord y priority (numérica, mapeada de priority_level) ya resueltos -- una OT de cotización se ordena en el tablero igual que una creada por +Nueva OT (auditoría 2026-08-31).';

COMMIT;

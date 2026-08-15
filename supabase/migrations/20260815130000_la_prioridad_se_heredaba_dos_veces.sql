-- La prioridad se heredaba dos veces, y Postgres no acepta eso.
--
--     ERROR: column "priority_level" specified more than once
--
-- La migración del 13 de agosto agregó `priority_level` a la lista de columnas
-- del INSERT sin ver que YA ESTABA — con el valor fijo `'normal'`. Dos veces la
-- misma columna hace fallar la sentencia entera, así que crear una OT desde una
-- cotización devolvía 400 y la cotización quedaba en `draft`.
--
-- Se saca la columna duplicada y se hereda el valor donde la columna ya vivía.
-- El `'normal'` fijo era, de paso, el motivo por el que una cotización marcada
-- urgente nacía como una cualquiera.

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
BEGIN
  SELECT * INTO v_vb FROM public.vistos_buenos WHERE id = p_vb_id;
  IF v_vb.id IS NULL THEN
    RAISE EXCEPTION 'Visto Bueno no encontrado: %', p_vb_id;
  END IF;

  IF v_vb.status = 'converted' AND v_vb.ot_id IS NOT NULL THEN
    RETURN v_vb.ot_id;
  END IF;

  -- No se exige firma para crear la orden.
  --
  -- La firma es el VISTO BUENO DE PRUEBA y ocurre DESPUÉS, cuando Pre-Prensa
  -- produjo algo que el cliente pueda aprobar. Exigirla acá invertía el orden:
  -- pedía firmar sobre un arte que todavía no existe, y dejaba la cotización
  -- encerrada en `draft` sin ninguna salida — el botón de generar OT sólo
  -- aparecía con estado `signed`, y firmar pedía la imagen del arte aprobado.
  --
  -- Lo único que se rechaza es una cotización muerta: rechazada o vencida.
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

  -- El VB permite 'light|medium|heavy' o un porcentaje libre; normalizamos a la
  -- clase que el motor entiende, sin inventar precisión que el dato no tiene.
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

  v_ot_number := public.generate_ot_number();

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    ink_coverage,
    subtotal, margin_pct, total_price, unit_price, status, notes,
    deadline, assigned_machine_id,
    finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz,
    finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion,
    flag_ord, flag_vbp
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product,
    COALESCE(v_vb.priority_level, 'normal')::public.ot_priority_level,
    v_vb.quantity,
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



-- ── Comprobación ────────────────────────────────────────────────────────────

DO $verifica$
DECLARE cuerpo text; ot_id uuid;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO cuerpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'convert_vb_to_ot';

  IF cuerpo IS NULL THEN
    RAISE EXCEPTION 'No se encontró convert_vb_to_ot. Se aborta.';
  END IF;
  -- Se busca el patrón que rompía, no un conteo. Contar la subcadena falla
  -- sola: `ot_priority_level` —el tipo del enum— contiene `priority_level`.
  IF cuerpo ILIKE '%deadline, priority_level, assigned_machine_id%' THEN
    RAISE EXCEPTION 'La columna priority_level sigue duplicada en el INSERT. Se aborta.';
  END IF;
  IF cuerpo NOT ILIKE '%COALESCE(v_vb.priority_level%' THEN
    RAISE EXCEPTION 'La prioridad no se hereda de la cotización. Se aborta.';
  END IF;

  RAISE NOTICE 'convert_vb_to_ot hereda la prioridad una sola vez.';
END $verifica$;

COMMIT;

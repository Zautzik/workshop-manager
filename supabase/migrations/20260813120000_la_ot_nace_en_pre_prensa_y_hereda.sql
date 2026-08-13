-- La OT nace en Pre-Prensa, y hereda lo que la cotización ya sabía.
--
-- ── Dos errores en la misma función ─────────────────────────────────────────
--
-- 1. `convert_vb_to_ot` creaba la orden directamente en `paper_purchase`. O sea
--    que aceptar un precio compraba papel: se saltaba Pre-Prensa —donde recién
--    se sabe qué pliego entra y cómo se monta— y se saltaba el VISTO BUENO, que
--    es el único acto que obliga a las dos partes.
--
--    Ese salto vaciaba de sentido el estado `visto_bueno` del enum. Estaba ahí,
--    en el orden correcto, y ninguna OT pasaba por él.
--
--    Ahora nace en `pre_press`. El recorrido queda como el oficio lo tiene:
--
--        Cotización → OT en pre_press → Pre-Prensa completa la ficha
--                   → prueba → VISTO BUENO firmado → Compra de papel
--
--    Y `flag_vbp` deja de marcarse al convertir: el visto bueno todavía no
--    ocurrió, y una bandera que dice que sí es peor que una que falta.
--
-- 2. Perdía la mitad de lo cotizado. La fecha de entrega, la prioridad, la
--    prensa y las diez terminaciones no viajaban — y las terminaciones son
--    entre el 15% y el 20% del costo. El vendedor las elegía, el cliente las
--    aceptaba, y la orden nacía sin ellas.
--
--    Tres de esos campos ni siquiera tenían dónde guardarse en `vistos_buenos`,
--    así que se agregan primero.

BEGIN;

-- ── Lo que la cotización necesita poder recordar ────────────────────────────

ALTER TABLE public.vistos_buenos
  ADD COLUMN IF NOT EXISTS deadline       DATE,
  ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS press_id       UUID REFERENCES public.machines(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vistos_buenos.press_id IS
  'Prensa objetivo. Decide qué pliego se puede montar, y el pliego decide los pliegos, los kilos y las horas: es el dato que más mueve el precio de una cotización.';

COMMENT ON COLUMN public.vistos_buenos.deadline IS
  'Fecha comprometida con el cliente. Es la segunda pregunta que hace, siempre.';

-- ── La conversión ───────────────────────────────────────────────────────────

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

  IF v_vb.status <> 'signed' THEN
    RAISE EXCEPTION 'El Visto Bueno debe estar firmado (estado actual: %)', v_vb.status;
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
    deadline, priority_level, assigned_machine_id,
    finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz,
    finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion,
    flag_ord, flag_vbp
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_ink,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'pre_press', v_vb.notes,
    v_vb.deadline,
    COALESCE(v_vb.priority_level, 'normal')::public.ot_priority_level,
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
DECLARE cuerpo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO cuerpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'convert_vb_to_ot';

  IF cuerpo IS NULL THEN
    RAISE EXCEPTION 'No se encontró convert_vb_to_ot. Se aborta.';
  END IF;
  IF cuerpo ILIKE '%''paper_purchase''%' THEN
    RAISE EXCEPTION 'La conversión sigue creando la OT en paper_purchase. Se aborta.';
  END IF;
  IF cuerpo NOT ILIKE '%finish_troquelado%' THEN
    RAISE EXCEPTION 'La conversión no hereda las terminaciones. Se aborta.';
  END IF;

  RAISE NOTICE 'convert_vb_to_ot crea la OT en pre_press y hereda fecha, prioridad, prensa y terminaciones.';
END $verifica$;

COMMIT;

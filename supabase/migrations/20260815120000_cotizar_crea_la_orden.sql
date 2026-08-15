-- Cotizar crea la orden. El visto bueno se firma después, sobre la prueba.
--
-- `convert_vb_to_ot` exigía que la cotización estuviera FIRMADA para poder
-- generar la OT. Eso invertía el orden del oficio y dejaba la cotización sin
-- salida:
--
--   · el botón «Generar OT» sólo aparece con estado `signed`
--   · firmar pide la imagen del arte aprobado
--   · el arte aprobado no existe todavía — se produce en Pre-Prensa
--
-- Resultado: guardar una cotización creaba un `VB-00008` en `draft` y ahí
-- quedaba. Nunca aparecía en el tablero, nunca entraba a Pre-Prensa, y no había
-- forma de sacarla de ahí sin firmar un papel en blanco.
--
-- El orden correcto —el que el dueño corrigió— es que hay UN solo visto bueno y
-- es el de prueba:
--
--     Cotización → OT en pre_press → Pre-Prensa completa la ficha
--                → prueba → VISTO BUENO firmado → Compra de papel
--
-- Así que la conversión ya no pide firma. Lo único que rechaza es una
-- cotización muerta: rechazada o vencida.

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
  IF cuerpo ILIKE '%debe estar firmado%' THEN
    RAISE EXCEPTION 'La conversión sigue exigiendo firma. Se aborta.';
  END IF;
  IF cuerpo NOT ILIKE '%''pre_press''%' THEN
    RAISE EXCEPTION 'La conversión dejó de crear la OT en pre_press. Se aborta.';
  END IF;

  RAISE NOTICE 'convert_vb_to_ot crea la OT en pre_press sin exigir firma.';
END $verifica$;

COMMIT;

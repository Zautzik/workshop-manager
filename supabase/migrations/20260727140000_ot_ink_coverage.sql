-- La cobertura de tinta llega hasta la OT.
--
-- El motor la modela desde hace tiempo (INK_COVERAGE_FACTOR light 0,5 /
-- medium 1,0 / heavy 1,8, cruzado con la absorbencia del sustrato) y hay tests
-- que lo prueban. El VB la captura y la guarda. Y ahí se caía: convert_vb_to_ot
-- no la llevaba, `ots` ni siquiera tenía la columna, y ningún código de
-- producción pasaba `inkCoverage` al motor — sólo los tests.
--
-- Resultado: cada OT costeaba tinta como 'medium'. Un trabajo de línea fina
-- pagaba tinta de más; un fondo sólido a full pagaba de menos, que es el que
-- duele porque se cotiza barato y se imprime caro.

ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS ink_coverage TEXT
  CHECK (ink_coverage IS NULL OR ink_coverage IN ('light', 'medium', 'heavy'));

COMMENT ON COLUMN public.ots.ink_coverage IS
  'Clase de cobertura del arte (light|medium|heavy). Multiplica el consumo de tinta en el motor de costeo junto con la absorbencia del sustrato. Viaja desde el Visto Bueno (auditoría 2026-07).';

-- El converter la traslada del VB.
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
    flag_ord, flag_vbp
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_ink,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'paper_purchase', v_vb.notes,
    TRUE, TRUE
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

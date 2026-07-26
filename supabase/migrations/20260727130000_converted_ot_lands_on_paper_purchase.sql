-- Una OT convertida nace esperando el papel, no esperando una aprobación que
-- ya ocurrió.
--
-- convert_vb_to_ot() insertaba la OT en 'visto_bueno'. Pero la función misma
-- exige que el VB esté FIRMADO para convertir (RAISE si no lo está), así que la
-- OT aterrizaba en la columna "Visto Bueno" del kanban pidiendo una aprobación
-- que el cliente ya había dado. Alguien tenía que arrastrarla a mano al
-- siguiente casillero — un paso manual cuyo único contenido es "sí, ya sé".
--
-- Ahora nace en 'paper_purchase' ("Compra de Papel"), que es la verdad
-- operativa: el trabajo está aprobado y lo que falta es pedir el material.
-- El resto del recorrido (→ in_storage cuando el papel llega) lo cierra la
-- recepción de la OC, no un arrastre.
--
-- Idéntica a 20260712120000 salvo por ese literal.

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
BEGIN
  SELECT * INTO v_vb FROM public.vistos_buenos WHERE id = p_vb_id;
  IF v_vb.id IS NULL THEN
    RAISE EXCEPTION 'Visto Bueno no encontrado: %', p_vb_id;
  END IF;

  -- Idempotent: already converted → return the existing OT.
  IF v_vb.status = 'converted' AND v_vb.ot_id IS NOT NULL THEN
    RETURN v_vb.ot_id;
  END IF;

  IF v_vb.status <> 'signed' THEN
    RAISE EXCEPTION 'El Visto Bueno debe estar firmado (estado actual: %)', v_vb.status;
  END IF;

  -- TEXT → enum, normalizing the VB form's digit notation for colors.
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

  v_ot_number := public.generate_ot_number();

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    subtotal, margin_pct, total_price, unit_price, status, notes,
    flag_ord, flag_vbp
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    -- Aprobado y esperando material, no esperando aprobación.
    'paper_purchase', v_vb.notes,
    -- La orden existe y el cliente ya dio su VB: los dos primeros hitos de la
    -- cadena ORD→PRO→VBP→PLN→PAP son hechos, no pendientes.
    TRUE, TRUE
  )
  RETURNING id INTO v_ot_id;

  -- Freeze the estimate into the unified cost ledger (source = 'vb').
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
  'Convierte un VB firmado en OT. La OT nace en paper_purchase con flag_ord y flag_vbp ya en TRUE: el trabajo está aprobado y lo que falta es pedir el papel (auditoría 2026-07).';

-- ============================================================
-- Fix P1.1 (demo-readiness plan §Phase 1) — convert_vb_to_ot() 500s
--
-- vistos_buenos stores product_type / substrate_type / color_front /
-- color_back as TEXT, but the matching ots columns are enums. In plpgsql a
-- typed TEXT variable does NOT auto-coerce into an enum column (string
-- literals do), so every conversion failed with:
--   column "product_type" is of type ot_product_type but expression is of type text
--
-- Fix: validate each TEXT value against the enum labels and cast explicitly.
-- Invalid legacy values raise a clear Spanish error instead of a raw cast
-- failure. Otherwise identical to 20260628150000_convert_vb_to_ot.sql.
-- ============================================================

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
  v_next      BIGINT;
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

  -- TEXT → enum, with a readable error when a legacy value doesn't match.
  BEGIN
    v_product   := v_vb.product_type::public.ot_product_type;
    v_substrate := v_vb.substrate_type::public.ot_substrate_type;
    v_c_front   := v_vb.color_front::public.ot_color_mode;
    v_c_back    := v_vb.color_back::public.ot_color_mode;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'El Visto Bueno tiene un valor no reconocido (producto: %, sustrato: %, colores: %/%). Corrígelo antes de convertir.',
      v_vb.product_type, v_vb.substrate_type, v_vb.color_front, v_vb.color_back;
  END;

  -- Next correlative OT number (OT-NNNNN); ignore the legacy OT-YYYY-NNN format.
  SELECT COALESCE(MAX(substring(ot_number from 4)::bigint), 40500) + 1
    INTO v_next
  FROM public.ots
  WHERE ot_number ~ '^OT-[0-9]+$';
  v_ot_number := 'OT-' || v_next;

  INSERT INTO public.ots (
    ot_number, client_id, client_name, salesman_id, vb_id,
    product_name, product_type, priority_level, quantity, description,
    width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
    subtotal, margin_pct, total_price, unit_price, status, notes
  ) VALUES (
    v_ot_number, v_vb.client_id, v_vb.client_name, v_vb.salesman_id, v_vb.id,
    v_vb.product_name, v_product, 'normal', v_vb.quantity,
    COALESCE(v_vb.notes, v_vb.product_name),
    v_vb.width_cm, v_vb.height_cm, v_substrate, v_vb.grammage_gsm,
    v_c_front, v_c_back,
    v_vb.subtotal_cost, v_vb.margin_pct, v_vb.total_price, v_vb.unit_price,
    'visto_bueno', v_vb.notes
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

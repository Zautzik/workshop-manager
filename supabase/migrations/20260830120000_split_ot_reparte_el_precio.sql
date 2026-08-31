-- `split_ot` no reparte el precio: las dos mitades cobran el trabajo entero
--
-- Encontrado en la auditoría 2026-08-30 (stress test del hilo dorado, Run 1).
-- La función copiaba `subtotal`, `total_price`, `margin_amount`,
-- `increment_amount` y `commission_amount` del padre al fragmento TAL CUAL,
-- sin repartirlos por la cantidad que cada mitad se lleva. `quantity` sí se
-- reparte (la línea `v_remaining := v_parent.quantity - p_advance_quantity`
-- ya lo hacía) — pero el precio, no.
--
-- Medido en vivo sobre un trabajo real: una OT de 250.000 etiquetas cotizada
-- en $1.049.539 se partió en 40.000 (padre) + 210.000 (fragmento). Las DOS
-- quedaron mostrando $1.049.539 de ingreso en `ot_cost_summary`. El fragmento
-- se descartaba de los totales "confiables" de Analítica sólo porque todavía
-- no tenía costo real cargado (`margin-confidence.ts` lo marca `unreliable`
-- con razón) — en el momento en que cargue cualquier costo real, un trabajo
-- que se vendió una vez por ~$1.05M empieza a sumar ~$2.1M en dos filas.
--
-- Es la misma familia que el bug de los 875× en `costing-resolver.ts`
-- (NOTES.md §1): código que se lee bien, silenciosamente incorrecto porque
-- nadie preguntó si el valor se conserva al partir.
--
-- ── El reparto ───────────────────────────────────────────────────────────
--
-- `unit_price` NO se toca: es total_price/quantity, y un $/unidad no cambia
-- porque se produzcan menos unidades del mismo trabajo — es invariante bajo
-- un reparto proporcional, así que tocarlo sería la corrección redundante.
--
-- Las cinco cantidades en plata (`subtotal`, `total_price`, `margin_amount`,
-- `increment_amount`, `commission_amount`) sí se reparten, en la misma
-- proporción que `quantity`. Para que la suma quede exacta al peso —y no un
-- peso de más o de menos por redondear cada lado por separado— el fragmento
-- se redondea primero y el padre se calcula como el resto: original menos
-- fragmento. `padre + fragmento = original`, siempre, al peso.
--
-- Fuera de alcance a propósito: `calc_sheets`, `calc_substrate_kg`,
-- `calc_ink_kg`, `calc_plates`, `calc_print_hours`, `calc_finish_hours`. Son
-- cantidades físicas con alistamiento fijo que no se reparten linealmente
-- (partir un tiraje a la mitad no es la mitad de pliegos de alistamiento) —
-- repartirlas bien es una pregunta de economía de impresión que esta
-- auditoría no midió, y adivinar sería peor que dejarlas como estaban.
--
-- El resto del cuerpo queda idéntico a la versión de
-- 20260827140000_split_ot_citaba_una_columna_muerta.sql: los seguros de
-- concurrencia, el cálculo de etiqueta y el tope de 26 fragmentos no se tocan.

BEGIN;

CREATE OR REPLACE FUNCTION public.split_ot(
  p_ot_id uuid,
  p_advance_quantity numeric,
  p_target_status public.ot_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent          public.ots%ROWTYPE;
  v_group_id        uuid;
  v_parent_label    text;
  v_max_label       text;
  v_new_label       text;
  v_base_number     text;
  v_new_number      text;
  v_remaining       numeric;
  v_new_id          uuid;
  -- Reparto de precio: el fragmento se lleva su proporción exacta de
  -- cantidad; el padre se lleva el resto, calculado por resta y no por su
  -- propia proporción redondeada, así la suma nunca se desvía del original.
  v_share_fragment  numeric;
  v_subtotal_frag   numeric;
  v_total_frag      numeric;
  v_margin_amt_frag numeric;
  v_incr_amt_frag   numeric;
  v_comm_amt_frag   numeric;
BEGIN
  -- Lock the parent row for the duration of the transaction.
  SELECT * INTO v_parent FROM public.ots WHERE id = p_ot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OT not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_advance_quantity <= 0 OR p_advance_quantity >= v_parent.quantity THEN
    RAISE EXCEPTION 'advance_quantity must be greater than 0 and less than the OT total quantity (%).', v_parent.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  v_remaining := v_parent.quantity - p_advance_quantity;

  -- Establish / reuse the split group and compute the next label.
  IF v_parent.split_group_id IS NULL THEN
    v_group_id     := gen_random_uuid();
    v_parent_label := 'A';
    v_new_label    := 'B';
  ELSE
    v_group_id     := v_parent.split_group_id;
    v_parent_label := COALESCE(v_parent.split_label, 'A');

    -- Lock every fragment in the group so concurrent splits serialise on label
    -- generation; the ot_number UNIQUE index is the ultimate safety net.
    PERFORM 1 FROM public.ots WHERE split_group_id = v_group_id FOR UPDATE;

    SELECT MAX(split_label) INTO v_max_label
    FROM public.ots
    WHERE split_group_id = v_group_id;

    v_max_label := COALESCE(v_max_label, v_parent_label);
    v_new_label := chr(ascii(v_max_label) + 1);
  END IF;

  IF v_new_label > 'Z' THEN
    RAISE EXCEPTION 'Split limit reached (maximum 26 fragments per order).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Base number = parent number without any trailing "-<LETTER>" suffix, so
  -- splitting a fragment (e.g. OT-100-B) yields OT-100-C, not OT-100-B-C.
  v_base_number := regexp_replace(v_parent.ot_number, '-[A-Z]$', '');
  v_new_number  := v_base_number || '-' || v_new_label;

  -- ── El reparto de precio ────────────────────────────────────────────────
  v_share_fragment := p_advance_quantity / v_parent.quantity;

  v_subtotal_frag   := ROUND(COALESCE(v_parent.subtotal, 0)          * v_share_fragment);
  v_total_frag      := ROUND(COALESCE(v_parent.total_price, 0)       * v_share_fragment);
  v_margin_amt_frag := ROUND(COALESCE(v_parent.margin_amount, 0)     * v_share_fragment);
  v_incr_amt_frag   := ROUND(COALESCE(v_parent.increment_amount, 0)  * v_share_fragment);
  v_comm_amt_frag   := ROUND(COALESCE(v_parent.commission_amount, 0) * v_share_fragment);

  -- 1. Shrink the parent and stamp its group membership. Its money columns
  --    become "original minus fragment" — the exact remainder, not its own
  --    independently-rounded share — so parent + fragment always reconstructs
  --    the pre-split total to the peso.
  UPDATE public.ots
  SET quantity          = v_remaining,
      is_partial        = true,
      split_group_id    = v_group_id,
      split_label       = v_parent_label,
      subtotal          = COALESCE(v_parent.subtotal, 0)          - v_subtotal_frag,
      total_price       = COALESCE(v_parent.total_price, 0)       - v_total_frag,
      margin_amount     = COALESCE(v_parent.margin_amount, 0)     - v_margin_amt_frag,
      increment_amount  = COALESCE(v_parent.increment_amount, 0)  - v_incr_amt_frag,
      commission_amount = COALESCE(v_parent.commission_amount, 0) - v_comm_amt_frag
      -- unit_price no cambia: total_price/quantity es invariante bajo un
      -- reparto proporcional exacto.
  WHERE id = p_ot_id;

  -- 2. Insert the advancing fragment, copying every spec column from the parent
  --    and overriding identity / quantity / status / split metadata / price.
  v_new_id := gen_random_uuid();

  INSERT INTO public.ots (
    id, ot_number, quantity, status, is_partial, split_group_id, split_label,
    completed_at,
    client_id, client_name, description, deadline, priority, priority_level,
    product_name, product_type, product_image_url,
    width_cm, height_cm, grammage_gsm,
    color_front, color_back, pantone_colors,
    substrate_type, substrate_brand, substrate_supplier,
    finish_troquelado, finish_plegado, finish_pegado, finish_laminado,
    finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping,
    finish_uv_localizado, finish_numeracion,
    flag_ord, flag_paper_arrived, flag_plan, flag_pro, flag_vbp,
    calc_sheets, calc_substrate_kg, calc_ink_kg, calc_plates,
    calc_print_hours, calc_finish_hours,
    subtotal, margin_pct, margin_amount, increment_pct, increment_amount,
    commission_pct, commission_amount, total_price, unit_price,
    assigned_machine_id, proceso_actual,
    template_id, created_by, notes
  )
  VALUES (
    v_new_id, v_new_number, p_advance_quantity, p_target_status, true, v_group_id, v_new_label,
    NULL,
    v_parent.client_id, v_parent.client_name, v_parent.description, v_parent.deadline, v_parent.priority, v_parent.priority_level,
    v_parent.product_name, v_parent.product_type, v_parent.product_image_url,
    v_parent.width_cm, v_parent.height_cm, v_parent.grammage_gsm,
    v_parent.color_front, v_parent.color_back, v_parent.pantone_colors,
    v_parent.substrate_type, v_parent.substrate_brand, v_parent.substrate_supplier,
    v_parent.finish_troquelado, v_parent.finish_plegado, v_parent.finish_pegado, v_parent.finish_laminado,
    v_parent.finish_barniz, v_parent.finish_relieve, v_parent.finish_perforado, v_parent.finish_hot_stamping,
    v_parent.finish_uv_localizado, v_parent.finish_numeracion,
    v_parent.flag_ord, v_parent.flag_paper_arrived, v_parent.flag_plan, v_parent.flag_pro, v_parent.flag_vbp,
    v_parent.calc_sheets, v_parent.calc_substrate_kg, v_parent.calc_ink_kg, v_parent.calc_plates,
    v_parent.calc_print_hours, v_parent.calc_finish_hours,
    v_subtotal_frag, v_parent.margin_pct, v_margin_amt_frag, v_parent.increment_pct, v_incr_amt_frag,
    v_parent.commission_pct, v_comm_amt_frag, v_total_frag, v_parent.unit_price,
    v_parent.assigned_machine_id, v_parent.proceso_actual,
    v_parent.template_id, v_parent.created_by, v_parent.notes
  );

  RETURN jsonb_build_object(
    'original', jsonb_build_object(
      'id', p_ot_id, 'quantity', v_remaining, 'split_label', v_parent_label,
      'total_price', COALESCE(v_parent.total_price, 0) - v_total_frag
    ),
    'split',    jsonb_build_object(
      'id', v_new_id, 'ot_number', v_new_number, 'quantity', p_advance_quantity,
      'status', p_target_status, 'split_label', v_new_label, 'total_price', v_total_frag
    ),
    'split_group_id', v_group_id
  );
END;
$$;

-- Se ejecuta como su dueño (SECURITY DEFINER) y la invoca sólo la capa de API
-- con el rol de servicio: no se otorga a anon ni a authenticated.
REVOKE ALL ON FUNCTION public.split_ot(uuid, numeric, public.ot_status) FROM PUBLIC, anon, authenticated;

COMMIT;

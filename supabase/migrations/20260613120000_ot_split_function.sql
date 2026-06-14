-- Atomic OT split (Track 2 — split hardening)
--
-- Replaces the previous two-write split (update original + insert fragment) in
-- src/app/api/ots/[id]/split/route.ts, which was non-atomic and could:
--   1. produce duplicate split_label / ot_number (UNIQUE violation) when the
--      same OT was split more than once, and
--   2. corrupt an existing split group on the JS rollback path.
--
-- This function performs both writes in a single transaction. Workflow-rule
-- validation (forward-only transition, role, approval/cost gates) stays in the
-- application layer (validateTransition) and is run BEFORE this is called.
--
-- Label assignment is derived from the MAX label already present in the split
-- group, so repeated splits never collide. The ot_number UNIQUE constraint is
-- the final backstop: if two concurrent splits in the same group race, the
-- second INSERT fails and the whole function rolls back cleanly.

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
  v_parent       public.ots%ROWTYPE;
  v_group_id     uuid;
  v_parent_label text;
  v_max_label    text;
  v_new_label    text;
  v_base_number  text;
  v_new_number   text;
  v_remaining    numeric;
  v_new_id       uuid;
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

  -- 1. Shrink the parent and stamp its group membership.
  UPDATE public.ots
  SET quantity       = v_remaining,
      is_partial     = true,
      split_group_id = v_group_id,
      split_label    = v_parent_label
  WHERE id = p_ot_id;

  -- 2. Insert the advancing fragment, copying every spec column from the parent
  --    and overriding identity / quantity / status / split metadata.
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
    assigned_machine_id, current_workstation_id, proceso_actual,
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
    v_parent.subtotal, v_parent.margin_pct, v_parent.margin_amount, v_parent.increment_pct, v_parent.increment_amount,
    v_parent.commission_pct, v_parent.commission_amount, v_parent.total_price, v_parent.unit_price,
    v_parent.assigned_machine_id, v_parent.current_workstation_id, v_parent.proceso_actual,
    v_parent.template_id, v_parent.created_by, v_parent.notes
  );

  RETURN jsonb_build_object(
    'original', jsonb_build_object('id', p_ot_id, 'quantity', v_remaining, 'split_label', v_parent_label),
    'split',    jsonb_build_object('id', v_new_id, 'ot_number', v_new_number, 'quantity', p_advance_quantity, 'status', p_target_status, 'split_label', v_new_label),
    'split_group_id', v_group_id
  );
END;
$$;

-- The function runs as its owner (SECURITY DEFINER); it is invoked only by the
-- service-role API layer, so do not grant EXECUTE to anon/authenticated.
REVOKE ALL ON FUNCTION public.split_ot(uuid, numeric, public.ot_status) FROM PUBLIC, anon, authenticated;

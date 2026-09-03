-- El presupuesto de una OT (`ot_operations`) no se volvía a generar después de
-- creada: `EditBudgetWizard` sólo llamaba a `generateDefaultOperations` cuando
-- la lista estaba vacía, así que subir la cantidad o cambiar una medida
-- después de un retroceso dejaba Estimado y Real congelados en la versión
-- vieja del trabajo (auditoría 2026-09, OT 41241 y 41242 — margen 29%/20%
-- ficticio en Rentabilidad).
--
-- La solución no es regenerar todo de nuevo cada vez: alguien pudo haber
-- corregido a mano una línea (un descuento negociado, un precio ajustado) y
-- perder eso en cada cambio de especificación sería peor que el bug que
-- arregla. Por eso el motor ahora RECONCILIA — vuelve a calcular lo que el
-- presupuesto debería ser y sólo pisa las líneas que él mismo generó; las que
-- alguien tocó a mano se dejan intactas y se marcan para revisión.
--
-- Para poder distinguir una cosa de la otra hace falta que la fila SEPA de
-- dónde salió. Antes no había forma de saberlo: una línea con un precio raro
-- podía ser una tarifa que el motor calculó mal, o podía ser la corrección
-- deliberada de alguien — indistinguibles sin este dato.

ALTER TABLE public.ot_operations
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ot_operations.is_manual IS
  'true cuando la línea la escribió o corrigió una persona a mano (UnifiedStepOperations, diálogo
   "Editar/Nueva Operación"). false cuando la generó el motor (generateDefaultOperations) y por lo
   tanto es segura de refrescar automáticamente cuando cambia la especificación de la OT.';

-- `replace_ot_operations` (migración 20260901170000) es el único camino que
-- escribe esta tabla y recalcula el precio en la misma transacción — este
-- cambio sólo agrega la columna nueva al INSERT, todo lo demás queda igual.
CREATE OR REPLACE FUNCTION public.replace_ot_operations(
  p_ot_id      UUID,
  p_operations JSONB
)
RETURNS public.ots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal   NUMERIC(12,2);
  v_margin     NUMERIC(12,2);
  v_increment  NUMERIC(12,2);
  v_commission NUMERIC(12,2);
  v_total      NUMERIC(12,2);
  v_margin_pct     NUMERIC;
  v_increment_pct  NUMERIC;
  v_commission_pct NUMERIC;
  v_quantity   NUMERIC;
  v_row public.ots;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ots WHERE id = p_ot_id) THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  DELETE FROM public.ot_operations WHERE ot_id = p_ot_id;

  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order, is_manual)
  SELECT
    p_ot_id,
    (r->>'category')::public.ot_operation_category,
    r->>'name',
    COALESCE(r->>'unit', 'unit'),
    COALESCE((r->>'quantity')::numeric, 0),
    COALESCE((r->>'unit_cost')::numeric, 0),
    COALESCE((r->>'sort_order')::int, 0),
    COALESCE((r->>'is_manual')::boolean, false)
  FROM jsonb_array_elements(p_operations) AS r;

  SELECT margin_pct, increment_pct, commission_pct, quantity
    INTO v_margin_pct, v_increment_pct, v_commission_pct, v_quantity
    FROM public.ots WHERE id = p_ot_id;

  SELECT COALESCE(SUM(total_cost), 0) INTO v_subtotal
    FROM public.ot_operations WHERE ot_id = p_ot_id;

  v_margin     := ROUND(v_subtotal * COALESCE(v_margin_pct, 0) / 100, 2);
  v_increment  := ROUND((v_subtotal + v_margin) * COALESCE(v_increment_pct, 0) / 100, 2);
  v_commission := ROUND((v_subtotal + v_margin + v_increment) * COALESCE(v_commission_pct, 0) / 100, 2);
  v_total      := v_subtotal + v_margin + v_increment + v_commission;

  UPDATE public.ots
  SET subtotal = v_subtotal,
      margin_amount = v_margin,
      increment_amount = v_increment,
      commission_amount = v_commission,
      total_price = v_total,
      unit_price = CASE WHEN COALESCE(v_quantity, 0) > 0 THEN ROUND(v_total / v_quantity, 4) ELSE 0 END,
      updated_at = now()
  WHERE id = p_ot_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_ot_operations(UUID, JSONB) TO authenticated;

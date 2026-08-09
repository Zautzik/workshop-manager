-- `material_cost_v` expone la geometría del pliego.
--
-- El motor de costeo lee esta vista para saber cuánto cuesta un sustrato, y
-- desde ahora puede CONVERTIR un precio por resma a precio por kilo en vez de
-- descartarlo — pero sólo si conoce el tamaño del pliego y su gramaje. Sin
-- esas columnas la conversión no es posible y el precio se pierde.
--
-- Es el mismo dato que ya guarda `inventory_items`; lo que faltaba era dejarlo
-- salir por donde el motor mira.

BEGIN;

CREATE OR REPLACE VIEW public.material_cost_v AS
SELECT
  i.id                          AS item_id,
  i.sku,
  i.name,
  i.unit,
  i.category::text              AS category,
  i.estimated_unit_cost,
  COALESCE(
    SUM(l.quantity_received * l.unit_cost) / NULLIF(SUM(l.quantity_received), 0),
    i.estimated_unit_cost
  )::NUMERIC(14,4)              AS weighted_cost,
  COUNT(l.id)                   AS lot_count,
  COALESCE(SUM(l.quantity_received), 0)::NUMERIC(14,3) AS total_received,
  (SELECT l2.unit_cost FROM public.inventory_lots l2
     WHERE l2.item_id = i.id ORDER BY l2.received_date DESC, l2.created_at DESC LIMIT 1) AS latest_cost,
  (SELECT l2.received_date FROM public.inventory_lots l2
     WHERE l2.item_id = i.id ORDER BY l2.received_date DESC, l2.created_at DESC LIMIT 1) AS latest_received,

  -- Geometría del pliego, al final: `CREATE OR REPLACE VIEW` sólo admite
  -- AGREGAR columnas, no intercalarlas entre las que ya existen.
  i.sheet_width_cm,
  i.sheet_height_cm,
  i.grammage_gsm,
  i.sheets_per_package
FROM public.inventory_items i
LEFT JOIN public.inventory_lots l ON l.item_id = i.id
WHERE i.is_active = true
GROUP BY i.id, i.sku, i.name, i.unit, i.category, i.estimated_unit_cost,
         i.sheet_width_cm, i.sheet_height_cm, i.grammage_gsm, i.sheets_per_package;

COMMENT ON VIEW public.material_cost_v IS
  'Costo por material: estimado, ponderado real de lotes y último de compra, más la geometría del pliego para convertir entre resma, pliego y kilo.';

GRANT SELECT ON public.material_cost_v TO authenticated;

COMMIT;

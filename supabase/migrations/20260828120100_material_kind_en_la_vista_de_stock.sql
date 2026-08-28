-- inventory_items_stock_v listaba sus columnas a mano y no traía la que se
-- acaba de agregar. InventoryManagement.tsx lee esta vista con select('*'),
-- así que sin esto la columna existe en la tabla pero es invisible para la
-- pantalla que la administra.

BEGIN;

-- `material_kind` va AL FINAL de las columnas existentes: CREATE OR REPLACE
-- VIEW no permite insertar una columna en el medio — Postgres la lee como un
-- intento de renombrar la columna que queda corrida de lugar (probado: "cannot
-- change name of view column unit to material_kind"). Sólo se puede agregar al
-- final sin recrear la vista (y sin arrastrar a inventory_low_stock_alerts_v,
-- que depende de ésta).
CREATE OR REPLACE VIEW public.inventory_items_stock_v AS
SELECT
  i.id,
  i.sku,
  i.barcode_value,
  i.qr_value,
  i.name,
  i.category,
  i.unit,
  i.min_stock,
  i.estimated_unit_cost,
  i.is_certification_required,
  i.is_active,
  i.notes,
  i.created_at,
  i.updated_at,
  COALESCE(SUM(l.quantity_available), 0)::NUMERIC(12,3) AS current_stock,
  COALESCE(
    SUM(l.quantity_available * l.unit_cost) / NULLIF(SUM(l.quantity_available), 0),
    i.estimated_unit_cost
  )::NUMERIC(12,4) AS weighted_unit_cost,
  i.material_kind
FROM public.inventory_items i
LEFT JOIN public.inventory_lots l ON l.item_id = i.id
GROUP BY i.id;

COMMIT;

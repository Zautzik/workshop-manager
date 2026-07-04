-- ============================================================
-- COST1.2 — Weighted material cost per SKU from real purchase lots
--
-- Prices materials off what we actually paid (inventory_lots, now populated by
-- P1/W1 receipts) instead of a hand-typed catalog line (audit #19/D5/B1).
-- inventory_items_stock_v.weighted_unit_cost already weights by *available*
-- qty; this view is purpose-built for costing: a purchase-weighted average
-- (by *received* qty), with the catalog estimate alongside for comparison so
-- drift is visible and the estimate engine (layer 3) can read the real number.
--
-- Additive + idempotent.
-- ============================================================

CREATE OR REPLACE VIEW public.material_cost_v AS
SELECT
  i.id                          AS item_id,
  i.sku,
  i.name,
  i.unit,
  i.category::text              AS category,
  i.estimated_unit_cost,
  -- Purchase-weighted average from real lots (by received quantity); falls back
  -- to the catalog estimate when there are no lots yet.
  COALESCE(
    SUM(l.quantity_received * l.unit_cost) / NULLIF(SUM(l.quantity_received), 0),
    i.estimated_unit_cost
  )::NUMERIC(14,4)              AS weighted_cost,
  COUNT(l.id)                   AS lot_count,
  COALESCE(SUM(l.quantity_received), 0)::NUMERIC(14,3) AS total_received,
  -- Most recent purchase price + date (the "latest known" cost).
  (SELECT l2.unit_cost FROM public.inventory_lots l2
     WHERE l2.item_id = i.id ORDER BY l2.received_date DESC, l2.created_at DESC LIMIT 1) AS latest_cost,
  (SELECT l2.received_date FROM public.inventory_lots l2
     WHERE l2.item_id = i.id ORDER BY l2.received_date DESC, l2.created_at DESC LIMIT 1) AS latest_received
FROM public.inventory_items i
LEFT JOIN public.inventory_lots l ON l.item_id = i.id
WHERE i.is_active = true
GROUP BY i.id, i.sku, i.name, i.unit, i.category, i.estimated_unit_cost;

COMMENT ON VIEW public.material_cost_v IS
  'Per-material costing: catalog estimate vs purchase-weighted average (by received qty) from inventory_lots, plus latest purchase price. Source of truth for material cost in pricing (COST layer 3).';

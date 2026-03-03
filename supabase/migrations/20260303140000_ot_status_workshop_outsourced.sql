-- Remove 'paper_received' status (redundant with 'in_storage')
-- Add 'workshop' and 'outsourced' optional steps before 'workshop_revision'
--
-- PostgreSQL does not support removing enum values directly,
-- so we recreate the enum type along with dependent columns.

-- 1. Drop views that depend on ots.status indirectly
DROP VIEW IF EXISTS public.inventory_stock_transactions_v;

-- 2. Add a temporary text column to hold current status values
ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS status_tmp TEXT;
UPDATE public.ots SET status_tmp = status::TEXT;

-- 3. Map deprecated 'paper_received' → 'in_storage'
UPDATE public.ots SET status_tmp = 'in_storage' WHERE status_tmp = 'paper_received';

-- 4. Drop default and column, then drop old enum
ALTER TABLE public.ots ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.ots DROP COLUMN status;
DROP TYPE IF EXISTS public.ot_status;

-- 5. Recreate enum without 'paper_received', adding 'workshop' and 'outsourced'
CREATE TYPE public.ot_status AS ENUM (
  'pre_press',
  'visto_bueno',
  'paper_purchase',
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop',
  'outsourced',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
  'completed'
);

-- 6. Re-add column with new enum type and migrate data back
ALTER TABLE public.ots ADD COLUMN status public.ot_status NOT NULL DEFAULT 'paper_purchase';
UPDATE public.ots SET status = status_tmp::public.ot_status;

-- 7. Drop temporary column
ALTER TABLE public.ots DROP COLUMN status_tmp;

-- 8. Recreate the inventory_stock_transactions_v view (depends on ots)
CREATE OR REPLACE VIEW public.inventory_stock_transactions_v AS
SELECT
  t.id,
  t.created_at,
  t.tx_type,
  t.quantity,
  t.unit_cost,
  (COALESCE(t.unit_cost, l.unit_cost, i.estimated_unit_cost) * t.quantity)::NUMERIC(12,4) AS estimated_total_cost,
  t.reference_code,
  t.notes,
  t.item_id,
  i.sku,
  i.name AS item_name,
  i.category,
  i.unit,
  t.lot_id,
  l.lot_number,
  l.certification_code,
  l.certification_expires_on,
  t.work_order_id,
  o.ot_number,
  o.client_name,
  t.created_by
FROM public.inventory_stock_transactions t
JOIN public.inventory_items i ON i.id = t.item_id
LEFT JOIN public.inventory_lots l ON l.id = t.lot_id
LEFT JOIN public.ots o ON o.id = t.work_order_id;

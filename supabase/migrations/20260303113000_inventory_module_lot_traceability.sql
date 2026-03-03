-- Inventory Module: categorized items, lot traceability, stock transactions,
-- low-stock alerts, and work-order consumption linkage.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_item_category') THEN
    CREATE TYPE public.inventory_item_category AS ENUM (
      'tool',
      'supply',
      'product_input',
      'spare_part'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_tx_type') THEN
    CREATE TYPE public.inventory_tx_type AS ENUM (
      'purchase',
      'consumption',
      'adjustment_in',
      'adjustment_out',
      'return_to_stock'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category public.inventory_item_category NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  estimated_unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  is_certification_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  certification_code TEXT,
  certification_expires_on DATE,
  supplier_name TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  quantity_received NUMERIC(12,3) NOT NULL CHECK (quantity_received >= 0),
  quantity_available NUMERIC(12,3) NOT NULL CHECK (quantity_available >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, lot_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE RESTRICT,
  work_order_id UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  tx_type public.inventory_tx_type NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference_code TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_is_active ON public.inventory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_id ON public.inventory_lots(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_cert_expiry ON public.inventory_lots(certification_expires_on);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_item_id ON public.inventory_stock_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_lot_id ON public.inventory_stock_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_work_order_id ON public.inventory_stock_transactions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_created_at ON public.inventory_stock_transactions(created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_inventory_lot_quantities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC(12,3);
  v_item_id UUID;
  v_lot_item_id UUID;
BEGIN
  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Inventory transaction requires lot_id for traceability.';
  END IF;

  SELECT item_id INTO v_lot_item_id
  FROM public.inventory_lots
  WHERE id = NEW.lot_id;

  IF v_lot_item_id IS NULL THEN
    RAISE EXCEPTION 'Lot % not found.', NEW.lot_id;
  END IF;

  v_item_id := COALESCE(NEW.item_id, v_lot_item_id);

  IF v_item_id <> v_lot_item_id THEN
    RAISE EXCEPTION 'Lot % does not belong to item %.', NEW.lot_id, v_item_id;
  END IF;

  NEW.item_id := v_item_id;

  IF NEW.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN
    v_delta := NEW.quantity;
  ELSIF NEW.tx_type IN ('consumption', 'adjustment_out') THEN
    v_delta := -NEW.quantity;
  ELSE
    RAISE EXCEPTION 'Unsupported inventory transaction type %', NEW.tx_type;
  END IF;

  UPDATE public.inventory_lots
  SET quantity_available = quantity_available + v_delta
  WHERE id = NEW.lot_id
    AND quantity_available + v_delta >= 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock in lot % for quantity %.', NEW.lot_id, NEW.quantity;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_lot_quantities ON public.inventory_stock_transactions;
CREATE TRIGGER trg_sync_inventory_lot_quantities
BEFORE INSERT ON public.inventory_stock_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_lot_quantities();

CREATE OR REPLACE VIEW public.inventory_items_stock_v AS
SELECT
  i.id,
  i.sku,
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
  )::NUMERIC(12,4) AS weighted_unit_cost
FROM public.inventory_items i
LEFT JOIN public.inventory_lots l ON l.item_id = i.id
GROUP BY i.id;

CREATE OR REPLACE VIEW public.inventory_low_stock_alerts_v AS
SELECT
  id,
  sku,
  name,
  category,
  unit,
  min_stock,
  current_stock,
  weighted_unit_cost,
  (min_stock - current_stock)::NUMERIC(12,3) AS shortage,
  CASE
    WHEN current_stock <= 0 THEN 'critical'
    WHEN current_stock <= min_stock * 0.5 THEN 'high'
    ELSE 'medium'
  END AS severity
FROM public.inventory_items_stock_v
WHERE is_active = true
  AND current_stock <= min_stock;

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

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view inventory items" ON public.inventory_items;
CREATE POLICY "Authenticated users can view inventory items"
ON public.inventory_items FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers can manage inventory items" ON public.inventory_items;
CREATE POLICY "Managers can manage inventory items"
ON public.inventory_items FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view inventory lots" ON public.inventory_lots;
CREATE POLICY "Authenticated users can view inventory lots"
ON public.inventory_lots FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers can manage inventory lots" ON public.inventory_lots;
CREATE POLICY "Managers can manage inventory lots"
ON public.inventory_lots FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view inventory transactions" ON public.inventory_stock_transactions;
CREATE POLICY "Authenticated users can view inventory transactions"
ON public.inventory_stock_transactions FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers can manage inventory transactions" ON public.inventory_stock_transactions;
CREATE POLICY "Managers can manage inventory transactions"
ON public.inventory_stock_transactions FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

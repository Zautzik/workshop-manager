-- =============================================================
-- WhatsApp Warehouse Tracking — Database Schema
--
-- Stores warehouse operator scans (QR codes, barcodes),
-- parsed data, and supervisor review workflow for inventory
-- movements (receive, use, return, check).
-- =============================================================

-- ─── Warehouse action type enum ──────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_action_type') THEN
    CREATE TYPE public.warehouse_action_type AS ENUM (
      'receive',
      'use',
      'return',
      'check',
      'unknown'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_review_status') THEN
    CREATE TYPE public.warehouse_review_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'needs_revision',
      'auto_approved'
    );
  END IF;
END $$;

-- ─── Main WhatsApp Warehouse Logs table ──────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_warehouse_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action
  action_type public.warehouse_action_type NOT NULL DEFAULT 'unknown',

  -- Inventory item reference
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name TEXT,
  item_sku TEXT,

  -- Lot reference (for lot-specific operations)
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,

  -- OT reference (for consumption / return against a work order)
  ot_number TEXT,
  ot_id UUID REFERENCES public.ots(id) ON DELETE SET NULL,

  -- Operator info
  operator_phone TEXT NOT NULL,
  operator_name TEXT,
  operator_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,

  -- Scan data
  scanned_value TEXT NOT NULL DEFAULT '',
  raw_message TEXT NOT NULL,
  message_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Parsed scan data (JSONB for flexibility)
  parsed_data JSONB,

  -- Quantities
  quantity NUMERIC(12,3),
  unit TEXT,
  unit_cost NUMERIC(12,4),
  supplier_name TEXT,

  -- Supervisor review workflow
  review_status public.warehouse_review_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,

  -- Supervisor corrections
  corrected_quantity NUMERIC(12,3),
  corrected_unit_cost NUMERIC(12,4),

  -- System integration
  fed_to_inventory BOOLEAN NOT NULL DEFAULT false,
  inventory_tx_id UUID REFERENCES public.inventory_stock_transactions(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wh_logs_item_id
  ON public.whatsapp_warehouse_logs(item_id);

CREATE INDEX IF NOT EXISTS idx_wh_logs_ot_number
  ON public.whatsapp_warehouse_logs(ot_number)
  WHERE ot_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wh_logs_operator_phone
  ON public.whatsapp_warehouse_logs(operator_phone);

CREATE INDEX IF NOT EXISTS idx_wh_logs_review_status
  ON public.whatsapp_warehouse_logs(review_status);

CREATE INDEX IF NOT EXISTS idx_wh_logs_action_type
  ON public.whatsapp_warehouse_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_wh_logs_created_at
  ON public.whatsapp_warehouse_logs(created_at DESC);

-- Composite: pending reviews for dashboard
CREATE INDEX IF NOT EXISTS idx_wh_logs_pending
  ON public.whatsapp_warehouse_logs(review_status, created_at DESC)
  WHERE review_status = 'pending';

-- Composite: today's activity stats
CREATE INDEX IF NOT EXISTS idx_wh_logs_today
  ON public.whatsapp_warehouse_logs(action_type, created_at)
  WHERE created_at >= CURRENT_DATE;

-- Deduplication: same operator + item + action within short window
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_logs_dedup
  ON public.whatsapp_warehouse_logs(item_id, operator_phone, action_type, message_timestamp)
  WHERE item_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_warehouse_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view WH logs" ON public.whatsapp_warehouse_logs;
CREATE POLICY "Authenticated users can view WH logs"
ON public.whatsapp_warehouse_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors can manage WH logs" ON public.whatsapp_warehouse_logs;
CREATE POLICY "Supervisors can manage WH logs"
ON public.whatsapp_warehouse_logs FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- ─── Updated at trigger ──────────────────────────────────────

DROP TRIGGER IF EXISTS update_wh_logs_updated_at ON public.whatsapp_warehouse_logs;
CREATE TRIGGER update_wh_logs_updated_at
BEFORE UPDATE ON public.whatsapp_warehouse_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ─── View: Pending warehouse reviews ─────────────────────────

CREATE OR REPLACE VIEW public.whatsapp_warehouse_pending_v AS
SELECT
  wl.id,
  wl.action_type,
  wl.item_id,
  wl.item_name,
  wl.item_sku,
  wl.lot_id,
  wl.ot_number,
  wl.operator_phone,
  wl.operator_name,
  wl.scanned_value,
  wl.raw_message,
  wl.message_timestamp,
  wl.parsed_data,
  wl.quantity,
  wl.unit,
  wl.unit_cost,
  wl.supplier_name,
  wl.review_status,
  wl.created_at,
  i.name AS inv_item_name,
  i.category AS inv_category,
  i.barcode_value AS inv_barcode,
  o.client_name AS ot_client,
  o.product_name AS ot_product,
  o.status AS ot_status
FROM public.whatsapp_warehouse_logs wl
LEFT JOIN public.inventory_items i ON i.id = wl.item_id
LEFT JOIN public.ots o ON o.id = wl.ot_id
WHERE wl.review_status = 'pending'
ORDER BY wl.created_at DESC;

-- ─── View: Today's warehouse activity summary ────────────────

CREATE OR REPLACE VIEW public.whatsapp_warehouse_today_v AS
SELECT
  COUNT(*) FILTER (WHERE review_status = 'pending') AS pending_reviews,
  COUNT(*) FILTER (WHERE review_status = 'approved' AND created_at >= CURRENT_DATE) AS approved_today,
  COUNT(*) FILTER (WHERE review_status = 'rejected' AND created_at >= CURRENT_DATE) AS rejected_today,
  COUNT(*) FILTER (WHERE action_type = 'receive' AND created_at >= CURRENT_DATE) AS receives_today,
  COUNT(*) FILTER (WHERE action_type = 'use' AND created_at >= CURRENT_DATE) AS consumptions_today,
  COUNT(*) FILTER (WHERE action_type = 'return' AND created_at >= CURRENT_DATE) AS returns_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS total_today
FROM public.whatsapp_warehouse_logs;

-- ─── Function: Feed approved warehouse data into inventory ───

CREATE OR REPLACE FUNCTION public.feed_warehouse_to_inventory(log_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.whatsapp_warehouse_logs%ROWTYPE;
  v_tx_type public.inventory_tx_type;
  v_qty NUMERIC(12,3);
  v_cost NUMERIC(12,4);
  v_tx_id UUID;
  v_lot_id UUID;
BEGIN
  SELECT * INTO v_log FROM public.whatsapp_warehouse_logs WHERE id = log_id;

  IF v_log IS NULL THEN
    RAISE EXCEPTION 'Warehouse log not found: %', log_id;
  END IF;

  IF v_log.review_status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'Log must be approved before feeding to inventory';
  END IF;

  IF v_log.item_id IS NULL THEN
    RAISE EXCEPTION 'Log has no linked inventory item';
  END IF;

  IF v_log.fed_to_inventory THEN
    RAISE EXCEPTION 'Log already fed to inventory';
  END IF;

  -- Determine transaction type
  CASE v_log.action_type
    WHEN 'receive' THEN v_tx_type := 'purchase';
    WHEN 'use' THEN v_tx_type := 'consumption';
    WHEN 'return' THEN v_tx_type := 'return_to_stock';
    ELSE RAISE EXCEPTION 'Action type % cannot be fed to inventory', v_log.action_type;
  END CASE;

  -- Use corrected values if available
  v_qty := COALESCE(v_log.corrected_quantity, v_log.quantity);
  v_cost := COALESCE(v_log.corrected_unit_cost, v_log.unit_cost);

  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Cannot create inventory transaction with null or zero quantity';
  END IF;

  -- For lot-tracked items, find or require a lot
  v_lot_id := v_log.lot_id;
  IF v_lot_id IS NULL THEN
    -- Try to find the most recent lot for this item
    SELECT id INTO v_lot_id
    FROM public.inventory_lots
    WHERE item_id = v_log.item_id
      AND quantity_available > 0
    ORDER BY received_date DESC
    LIMIT 1;
  END IF;

  -- For purchases without a lot, create one
  IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
    INSERT INTO public.inventory_lots (
      item_id, lot_number, supplier_name, received_date,
      unit_cost, quantity_received, quantity_available
    ) VALUES (
      v_log.item_id,
      'WA-' || to_char(now(), 'YYYYMMDD-HH24MI'),
      v_log.supplier_name,
      CURRENT_DATE,
      COALESCE(v_cost, 0),
      v_qty,
      v_qty
    )
    RETURNING id INTO v_lot_id;
  END IF;

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'No lot found for item %. Create a lot first.', v_log.item_id;
  END IF;

  -- Create the inventory transaction
  INSERT INTO public.inventory_stock_transactions (
    item_id, lot_id, work_order_id, tx_type,
    quantity, unit_cost, reference_code, notes, created_by
  ) VALUES (
    v_log.item_id,
    v_lot_id,
    v_log.ot_id,
    v_tx_type,
    v_qty,
    v_cost,
    'WA-WH-' || v_log.id::TEXT,
    COALESCE(v_log.review_comments, 'Vía WhatsApp bodega'),
    v_log.reviewed_by
  )
  RETURNING id INTO v_tx_id;

  -- Mark as fed
  UPDATE public.whatsapp_warehouse_logs
  SET fed_to_inventory = true,
      inventory_tx_id = v_tx_id,
      updated_at = now()
  WHERE id = log_id;

  RETURN v_tx_id;
END;
$$;

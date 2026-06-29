-- ============================================================
-- CAP1.1 — Unified capture spine (capture_events) — Phase A
--
-- Today two parallel pipelines capture human reports:
--   whatsapp_production_logs → feed_whatsapp_to_real_costs → ot_real_costs
--   whatsapp_warehouse_logs  → feed_warehouse_to_inventory → inventory
--
-- This unifies them onto ONE table (capture_events) with a single router
-- (apply_capture_event) that dispatches by domain. Phase A is additive and
-- non-breaking: it creates the table, backfills both legacy tables (with
-- lineage), and provides the router + a read view. The legacy tables/functions
-- keep working until Phase B repoints the webhooks/APIs/UI, and Phase C drops
-- the legacy tables.
--
-- Idempotent (backfill keyed by legacy lineage). Apply, then regen types.ts.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capture_domain') THEN
    CREATE TYPE public.capture_domain AS ENUM
      ('production', 'warehouse', 'dispatch', 'receipt', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capture_channel') THEN
    CREATE TYPE public.capture_channel AS ENUM
      ('whatsapp', 'qr', 'manual', 'photo', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capture_status') THEN
    CREATE TYPE public.capture_status AS ENUM
      ('pending', 'approved', 'auto_approved', 'rejected', 'needs_revision');
  END IF;
END $$;

-- ─── The spine ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capture_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                public.capture_domain  NOT NULL,
  event_type            TEXT NOT NULL,                 -- prod: message_type; wh: action_type
  channel               public.capture_channel NOT NULL DEFAULT 'whatsapp',
  -- reporter
  operator_phone        TEXT,
  operator_name         TEXT,
  operator_employee_id  UUID,
  -- references (across domains)
  ot_id        UUID REFERENCES public.ots(id)        ON DELETE SET NULL,
  ot_number    TEXT,
  item_id      UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  lot_id       UUID REFERENCES public.inventory_lots(id)  ON DELETE SET NULL,
  purchase_id  UUID REFERENCES public.purchases(id)  ON DELETE SET NULL,
  guide_id     UUID,
  -- capture content
  raw_message       TEXT,
  scanned_value     TEXT,
  photo_url         TEXT,
  message_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- structured / domain-specific
  quantity        NUMERIC(14,3),
  unit            TEXT,
  unit_cost       NUMERIC(14,4),
  elapsed_minutes NUMERIC,
  parsed_data     JSONB,
  inferred_costs  JSONB,
  corrected_data  JSONB,
  corrected_costs JSONB,
  -- review
  status          public.capture_status NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  -- application (replaces fed_to_system / fed_to_inventory)
  applied          BOOLEAN NOT NULL DEFAULT false,
  applied_ref_type TEXT,                                -- real_cost | inventory_tx
  applied_ref_id   UUID,
  -- lineage to legacy row during transition (also the backfill idempotency key)
  legacy_table TEXT,
  legacy_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_events_domain  ON public.capture_events(domain);
CREATE INDEX IF NOT EXISTS idx_capture_events_status  ON public.capture_events(status);
CREATE INDEX IF NOT EXISTS idx_capture_events_ot      ON public.capture_events(ot_id);
CREATE INDEX IF NOT EXISTS idx_capture_events_applied ON public.capture_events(applied);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_events_legacy
  ON public.capture_events(legacy_table, legacy_id) WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_capture_events_updated_at ON public.capture_events;
CREATE TRIGGER update_capture_events_updated_at
BEFORE UPDATE ON public.capture_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS (authenticated read, ops manage) ────────────────────
ALTER TABLE public.capture_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view captures" ON public.capture_events;
CREATE POLICY "Authenticated can view captures"
ON public.capture_events FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ops roles manage captures" ON public.capture_events;
CREATE POLICY "Ops roles manage captures"
ON public.capture_events FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

-- ─── Backfill: production logs ───────────────────────────────
INSERT INTO public.capture_events (
  domain, event_type, channel, operator_phone, operator_name, operator_employee_id,
  ot_id, ot_number, raw_message, message_timestamp, elapsed_minutes,
  parsed_data, inferred_costs, corrected_data, corrected_costs,
  status, review_comments, reviewed_by, reviewed_at, applied,
  legacy_table, legacy_id, created_at, updated_at
)
SELECT
  'production', p.message_type::text, 'whatsapp', p.operator_phone, p.operator_name, p.operator_employee_id,
  p.ot_id, p.ot_number, p.raw_message, p.message_timestamp, p.elapsed_minutes,
  p.parsed_data, p.inferred_costs, p.corrected_data, p.corrected_costs,
  p.review_status::text::public.capture_status, p.review_comments, p.reviewed_by, p.reviewed_at, p.fed_to_system,
  'whatsapp_production_logs', p.id, p.created_at, p.updated_at
FROM public.whatsapp_production_logs p
WHERE NOT EXISTS (
  SELECT 1 FROM public.capture_events c
  WHERE c.legacy_table = 'whatsapp_production_logs' AND c.legacy_id = p.id
);

-- ─── Backfill: warehouse logs ────────────────────────────────
INSERT INTO public.capture_events (
  domain, event_type, channel, operator_phone, operator_name, operator_employee_id,
  ot_id, ot_number, item_id, lot_id, raw_message, scanned_value, message_timestamp,
  quantity, unit, unit_cost, parsed_data,
  status, review_comments, reviewed_by, reviewed_at, applied, applied_ref_type, applied_ref_id,
  legacy_table, legacy_id, created_at, updated_at
)
SELECT
  'warehouse', w.action_type::text, 'whatsapp', w.operator_phone, w.operator_name, w.operator_employee_id,
  w.ot_id, w.ot_number, w.item_id, w.lot_id, w.raw_message, w.scanned_value, w.message_timestamp,
  COALESCE(w.corrected_quantity, w.quantity), w.unit, COALESCE(w.corrected_unit_cost, w.unit_cost), w.parsed_data,
  w.review_status::text::public.capture_status, w.review_comments, w.reviewed_by, w.reviewed_at,
  w.fed_to_inventory, CASE WHEN w.inventory_tx_id IS NOT NULL THEN 'inventory_tx' END, w.inventory_tx_id,
  'whatsapp_warehouse_logs', w.id, w.created_at, w.updated_at
FROM public.whatsapp_warehouse_logs w
WHERE NOT EXISTS (
  SELECT 1 FROM public.capture_events c
  WHERE c.legacy_table = 'whatsapp_warehouse_logs' AND c.legacy_id = w.id
);

-- ─── Router: apply an approved capture to the right system ────
CREATE OR REPLACE FUNCTION public.apply_capture_event(p_event_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e       public.capture_events%ROWTYPE;
  v_costs   JSONB;
  v_line    JSONB;
  v_tx_type public.inventory_tx_type;
  v_qty     NUMERIC;
  v_cost    NUMERIC;
  v_lot_id  UUID;
  v_tx_id   UUID;
BEGIN
  SELECT * INTO v_e FROM public.capture_events WHERE id = p_event_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Capture no encontrada: %', p_event_id; END IF;
  IF v_e.status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'La captura debe estar aprobada antes de aplicarse (estado: %)', v_e.status;
  END IF;
  IF v_e.applied THEN RAISE EXCEPTION 'La captura ya fue aplicada'; END IF;

  IF v_e.domain = 'production' THEN
    v_costs := COALESCE(v_e.corrected_costs, v_e.inferred_costs);
    IF v_costs IS NULL OR v_costs->'cost_lines' IS NULL THEN
      RAISE EXCEPTION 'Sin datos de costo para aplicar';
    END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines') LOOP
      INSERT INTO public.ot_real_costs
        (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, recorded_by, notes)
      VALUES (
        v_e.ot_id, 'whatsapp_report', 'WA-' || LEFT(v_e.id::TEXT, 8),
        v_line->>'description', COALESCE(v_line->>'category', 'otros'),
        COALESCE((v_line->>'quantity')::NUMERIC, 0), COALESCE(v_line->>'unit', 'unit'),
        COALESCE((v_line->>'unit_cost')::NUMERIC, 0), v_e.reviewed_by,
        'Registrado vía captura por ' || COALESCE(v_e.operator_name, v_e.operator_phone)
      );
    END LOOP;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'real_cost', updated_at = now()
     WHERE id = p_event_id;
    RETURN p_event_id;

  ELSIF v_e.domain = 'warehouse' THEN
    IF v_e.item_id IS NULL THEN RAISE EXCEPTION 'Captura sin material vinculado'; END IF;
    CASE v_e.event_type
      WHEN 'receive' THEN v_tx_type := 'purchase';
      WHEN 'use'     THEN v_tx_type := 'consumption';
      WHEN 'return'  THEN v_tx_type := 'return_to_stock';
      ELSE RAISE EXCEPTION 'Acción % no se puede aplicar a inventario', v_e.event_type;
    END CASE;

    v_qty  := v_e.quantity;
    v_cost := v_e.unit_cost;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    v_lot_id := v_e.lot_id;
    IF v_lot_id IS NULL THEN
      SELECT id INTO v_lot_id FROM public.inventory_lots
       WHERE item_id = v_e.item_id AND quantity_available > 0
       ORDER BY received_date DESC LIMIT 1;
    END IF;
    IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
      INSERT INTO public.inventory_lots
        (item_id, lot_number, purchase_id, supplier_name, received_date, unit_cost, quantity_received, quantity_available)
      VALUES (v_e.item_id, 'CAP-' || to_char(now(), 'YYYYMMDD-HH24MI'), v_e.purchase_id, NULL, CURRENT_DATE,
              COALESCE(v_cost, 0), v_qty, v_qty)
      RETURNING id INTO v_lot_id;
    END IF;
    IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay lote para el material %', v_e.item_id; END IF;

    INSERT INTO public.inventory_stock_transactions
      (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_by)
    VALUES (v_e.item_id, v_lot_id, v_e.ot_id, v_tx_type, v_qty, v_cost,
            'CAP-' || v_e.id::TEXT, COALESCE(v_e.review_comments, 'Vía captura'), v_e.reviewed_by)
    RETURNING id INTO v_tx_id;

    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'inventory_tx', applied_ref_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
     WHERE id = p_event_id;
    RETURN v_tx_id;

  ELSE
    RAISE EXCEPTION 'Dominio % aún no soportado por el router', v_e.domain;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_capture_event TO authenticated;

-- ─── Unified read view (the inbox) ───────────────────────────
CREATE OR REPLACE VIEW public.capture_feed AS
SELECT
  c.id, c.domain, c.event_type, c.channel, c.status, c.applied,
  c.operator_name, c.operator_phone, c.ot_id, c.ot_number, c.item_id,
  c.quantity, c.unit, c.unit_cost, c.raw_message, c.message_timestamp,
  c.reviewed_by, c.reviewed_at, c.created_at
FROM public.capture_events c;

COMMENT ON TABLE public.capture_events IS
  'Unified human-capture spine (WhatsApp/QR/photo/manual) across all domains. Router: apply_capture_event(). Phase A backfills the two legacy whatsapp_*_logs tables.';

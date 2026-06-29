-- ============================================================
-- CAP1.3 — Phase B2: mirror legacy capture writes into the spine
--
-- Rather than rewrite the two large webhooks (parsing / start-end pairing /
-- cost inference all run against the legacy tables — high regression risk), we
-- mirror at the DB: AFTER INSERT OR UPDATE on each legacy log upserts into
-- capture_events (keyed by lineage). Every ingestion path (webhook, manual
-- entry, legacy review) now keeps the unified inbox live, with zero app change.
--
-- One-way (legacy → capture_events). Inbox-driven changes write capture_events
-- directly and don't touch the legacy row, so they're never clobbered. Phase C
-- flips ingestion onto capture_events and drops the legacy tables/triggers.
--
-- Idempotent (CREATE OR REPLACE / DROP+CREATE TRIGGER).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mirror_legacy_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.capture_events
    WHERE legacy_table = TG_TABLE_NAME AND legacy_id = NEW.id
  ) INTO v_exists;

  IF TG_TABLE_NAME = 'whatsapp_production_logs' THEN
    IF v_exists THEN
      UPDATE public.capture_events SET
        event_type      = NEW.message_type::text,
        ot_id           = NEW.ot_id,
        ot_number       = NEW.ot_number,
        raw_message     = NEW.raw_message,
        elapsed_minutes = NEW.elapsed_minutes,
        parsed_data     = NEW.parsed_data,
        inferred_costs  = NEW.inferred_costs,
        corrected_data  = NEW.corrected_data,
        corrected_costs = NEW.corrected_costs,
        status          = NEW.review_status::text::public.capture_status,
        review_comments = NEW.review_comments,
        reviewed_by     = NEW.reviewed_by,
        reviewed_at     = NEW.reviewed_at,
        applied         = NEW.fed_to_system,
        updated_at      = now()
      WHERE legacy_table = 'whatsapp_production_logs' AND legacy_id = NEW.id;
    ELSE
      INSERT INTO public.capture_events (
        domain, event_type, channel, operator_phone, operator_name, operator_employee_id,
        ot_id, ot_number, raw_message, message_timestamp, elapsed_minutes,
        parsed_data, inferred_costs, corrected_data, corrected_costs,
        status, review_comments, reviewed_by, reviewed_at, applied,
        legacy_table, legacy_id, created_at, updated_at
      ) VALUES (
        'production', NEW.message_type::text, 'whatsapp', NEW.operator_phone, NEW.operator_name, NEW.operator_employee_id,
        NEW.ot_id, NEW.ot_number, NEW.raw_message, NEW.message_timestamp, NEW.elapsed_minutes,
        NEW.parsed_data, NEW.inferred_costs, NEW.corrected_data, NEW.corrected_costs,
        NEW.review_status::text::public.capture_status, NEW.review_comments, NEW.reviewed_by, NEW.reviewed_at, NEW.fed_to_system,
        'whatsapp_production_logs', NEW.id, NEW.created_at, NEW.updated_at
      );
    END IF;

  ELSIF TG_TABLE_NAME = 'whatsapp_warehouse_logs' THEN
    IF v_exists THEN
      UPDATE public.capture_events SET
        event_type      = NEW.action_type::text,
        ot_id           = NEW.ot_id,
        ot_number       = NEW.ot_number,
        item_id         = NEW.item_id,
        lot_id          = NEW.lot_id,
        raw_message     = NEW.raw_message,
        scanned_value   = NEW.scanned_value,
        quantity        = COALESCE(NEW.corrected_quantity, NEW.quantity),
        unit            = NEW.unit,
        unit_cost       = COALESCE(NEW.corrected_unit_cost, NEW.unit_cost),
        parsed_data     = NEW.parsed_data,
        status          = NEW.review_status::text::public.capture_status,
        review_comments = NEW.review_comments,
        reviewed_by     = NEW.reviewed_by,
        reviewed_at     = NEW.reviewed_at,
        applied          = NEW.fed_to_inventory,
        applied_ref_type = CASE WHEN NEW.inventory_tx_id IS NOT NULL THEN 'inventory_tx' END,
        applied_ref_id   = NEW.inventory_tx_id,
        updated_at       = now()
      WHERE legacy_table = 'whatsapp_warehouse_logs' AND legacy_id = NEW.id;
    ELSE
      INSERT INTO public.capture_events (
        domain, event_type, channel, operator_phone, operator_name, operator_employee_id,
        ot_id, ot_number, item_id, lot_id, raw_message, scanned_value, message_timestamp,
        quantity, unit, unit_cost, parsed_data,
        status, review_comments, reviewed_by, reviewed_at, applied, applied_ref_type, applied_ref_id,
        legacy_table, legacy_id, created_at, updated_at
      ) VALUES (
        'warehouse', NEW.action_type::text, 'whatsapp', NEW.operator_phone, NEW.operator_name, NEW.operator_employee_id,
        NEW.ot_id, NEW.ot_number, NEW.item_id, NEW.lot_id, NEW.raw_message, NEW.scanned_value, NEW.message_timestamp,
        COALESCE(NEW.corrected_quantity, NEW.quantity), NEW.unit, COALESCE(NEW.corrected_unit_cost, NEW.unit_cost), NEW.parsed_data,
        NEW.review_status::text::public.capture_status, NEW.review_comments, NEW.reviewed_by, NEW.reviewed_at,
        NEW.fed_to_inventory, CASE WHEN NEW.inventory_tx_id IS NOT NULL THEN 'inventory_tx' END, NEW.inventory_tx_id,
        'whatsapp_warehouse_logs', NEW.id, NEW.created_at, NEW.updated_at
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mirror_production_to_capture ON public.whatsapp_production_logs;
CREATE TRIGGER mirror_production_to_capture
AFTER INSERT OR UPDATE ON public.whatsapp_production_logs
FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_capture();

DROP TRIGGER IF EXISTS mirror_warehouse_to_capture ON public.whatsapp_warehouse_logs;
CREATE TRIGGER mirror_warehouse_to_capture
AFTER INSERT OR UPDATE ON public.whatsapp_warehouse_logs
FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_capture();

COMMENT ON FUNCTION public.mirror_legacy_capture IS
  'Phase B2: mirrors whatsapp_production_logs / whatsapp_warehouse_logs writes into capture_events (one-way), keeping the unified inbox live without changing the webhooks.';

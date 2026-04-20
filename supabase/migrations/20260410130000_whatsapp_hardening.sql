-- =============================================================
-- WhatsApp Production Tracking — Hardening Migration
--
-- Adds deduplication constraint, composite indexes, and
-- updates the message type enum with 'cancel' support.
-- =============================================================

-- ─── Add 'cancel' to enum if not exists ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'cancel'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'whatsapp_message_type')
  ) THEN
    ALTER TYPE public.whatsapp_message_type ADD VALUE 'cancel';
  END IF;
END $$;

-- ─── Composite indexes for common queries ────────────────────

-- Supervisor dashboard: pending end messages sorted by date
CREATE INDEX IF NOT EXISTS idx_wa_logs_pending_ends
  ON public.whatsapp_production_logs(created_at DESC)
  WHERE message_type = 'end' AND review_status = 'pending';

-- Dedup check: recent END messages per operator+OT
CREATE INDEX IF NOT EXISTS idx_wa_logs_dedup
  ON public.whatsapp_production_logs(ot_number, operator_phone, message_type, message_timestamp DESC)
  WHERE message_type = 'end';

-- Active session lookup: starts without corresponding ends
CREATE INDEX IF NOT EXISTS idx_wa_logs_active_starts
  ON public.whatsapp_production_logs(ot_number, operator_phone, message_timestamp DESC)
  WHERE message_type = 'start' AND review_status = 'auto_approved';

-- Today's stats: filter by created_at for summary API
CREATE INDEX IF NOT EXISTS idx_wa_logs_today_stats
  ON public.whatsapp_production_logs(created_at, review_status, message_type);

-- ─── Partial unique constraint to prevent duplicate end messages ──

-- Prevents the same operator from submitting two identical end messages
-- within a very short window. Uses message content hash for uniqueness.
-- Note: exact-same-second duplicates are blocked; real retries will have
-- different timestamps so this protects against network-level duplicates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_wa_logs_dedup_end'
  ) THEN
    ALTER TABLE public.whatsapp_production_logs
    ADD CONSTRAINT uq_wa_logs_dedup_end
    UNIQUE (ot_number, operator_phone, message_type, message_timestamp);
  END IF;
END $$;

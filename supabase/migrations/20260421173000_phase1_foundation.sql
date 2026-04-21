-- ================================================================
-- Phase 1 Foundation: Notifications, Workflow Transitions, Reporting
-- ================================================================

-- -----------------------------
-- 1) Notifications
-- -----------------------------
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'ot_status_changed',
    'ot_approval_required',
    'ot_approved',
    'ot_rejected',
    'report_ready',
    'system_alert'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read)
  WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_insert_admin ON notifications;
CREATE POLICY notifications_insert_admin
  ON notifications
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

-- -----------------------------
-- 2) OT state transition audit
-- -----------------------------
CREATE TABLE IF NOT EXISTS ot_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  from_status ot_status,
  to_status ot_status NOT NULL,
  changed_by UUID,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_state_transitions_ot_created
  ON ot_state_transitions (ot_id, created_at DESC);

ALTER TABLE ot_state_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_state_transitions_read_ops ON ot_state_transitions;
CREATE POLICY ot_state_transitions_read_ops
  ON ot_state_transitions
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS ot_state_transitions_insert_ops ON ot_state_transitions;
CREATE POLICY ot_state_transitions_insert_ops
  ON ot_state_transitions
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

-- Safety net trigger to ensure transitions are captured even if ot status updates happen outside API.
CREATE OR REPLACE FUNCTION log_ot_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO ot_state_transitions (
      ot_id,
      from_status,
      to_status,
      changed_by,
      reason,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NULL,
      'db_trigger_auto_log',
      jsonb_build_object('source', 'trigger'),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_log_ot_status_transition
  AFTER UPDATE ON ots
  FOR EACH ROW
  EXECUTE FUNCTION log_ot_status_transition();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------
-- 3) Reporting snapshots
-- -----------------------------
CREATE TABLE IF NOT EXISTS reporting_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_date
  ON reporting_snapshots (snapshot_date DESC);

ALTER TABLE reporting_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reporting_snapshots_read_ops ON reporting_snapshots;
CREATE POLICY reporting_snapshots_read_ops
  ON reporting_snapshots
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS reporting_snapshots_write_admin ON reporting_snapshots;
CREATE POLICY reporting_snapshots_write_admin
  ON reporting_snapshots
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- -----------------------------
-- 4) Reporting export queue (audit-ready)
-- -----------------------------
DO $$ BEGIN
  CREATE TYPE report_export_status AS ENUM ('queued', 'processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reporting_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status report_export_status NOT NULL DEFAULT 'queued',
  file_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reporting_exports_requester
  ON reporting_exports (requested_by, created_at DESC);

ALTER TABLE reporting_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reporting_exports_read_own_or_admin ON reporting_exports;
CREATE POLICY reporting_exports_read_own_or_admin
  ON reporting_exports
  FOR SELECT
  USING (
    auth.uid() = requested_by
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS reporting_exports_insert_ops ON reporting_exports;
CREATE POLICY reporting_exports_insert_ops
  ON reporting_exports
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS reporting_exports_update_admin ON reporting_exports;
CREATE POLICY reporting_exports_update_admin
  ON reporting_exports
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

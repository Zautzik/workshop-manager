-- ================================================================
-- Tier 2 Foundation: Search, Bulk Ops, Integrations, Access Templates, Training
-- ================================================================

-- -----------------------------
-- 1) Saved searches
-- -----------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_domain
  ON saved_searches (user_id, domain, created_at DESC);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_searches_select_own ON saved_searches;
CREATE POLICY saved_searches_select_own
  ON saved_searches
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_searches_insert_own ON saved_searches;
CREATE POLICY saved_searches_insert_own
  ON saved_searches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_searches_update_own ON saved_searches;
CREATE POLICY saved_searches_update_own
  ON saved_searches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_searches_delete_own ON saved_searches;
CREATE POLICY saved_searches_delete_own
  ON saved_searches
  FOR DELETE
  USING (auth.uid() = user_id);

-- -----------------------------
-- 2) Integration connectors
-- -----------------------------
DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('inactive', 'active', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS integration_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  status integration_status NOT NULL DEFAULT 'inactive',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, name)
);

CREATE INDEX IF NOT EXISTS idx_integration_connectors_provider
  ON integration_connectors (provider, status);

ALTER TABLE integration_connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_connectors_read_ops ON integration_connectors;
CREATE POLICY integration_connectors_read_ops
  ON integration_connectors
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS integration_connectors_write_admin ON integration_connectors;
CREATE POLICY integration_connectors_write_admin
  ON integration_connectors
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- -----------------------------
-- 3) Permission templates
-- -----------------------------
CREATE TABLE IF NOT EXISTS permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT,
  role app_role,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_role_dept
  ON permission_templates (role, department)
  WHERE is_active = TRUE;

ALTER TABLE permission_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_templates_read_ops ON permission_templates;
CREATE POLICY permission_templates_read_ops
  ON permission_templates
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

DROP POLICY IF EXISTS permission_templates_write_admin_hr ON permission_templates;
CREATE POLICY permission_templates_write_admin_hr
  ON permission_templates
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

-- -----------------------------
-- 4) Training / knowledge base
-- -----------------------------
CREATE TABLE IF NOT EXISTS training_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_md TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_articles_published
  ON training_articles (is_published, created_at DESC);

ALTER TABLE training_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_articles_read_published_or_ops ON training_articles;
CREATE POLICY training_articles_read_published_or_ops
  ON training_articles
  FOR SELECT
  USING (
    is_published = TRUE
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

DROP POLICY IF EXISTS training_articles_write_ops ON training_articles;
CREATE POLICY training_articles_write_ops
  ON training_articles
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

-- -----------------------------
-- 5) Bulk operation jobs
-- -----------------------------
DO $$ BEGIN
  CREATE TYPE bulk_job_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bulk_operation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL,
  requested_by UUID NOT NULL,
  status bulk_job_status NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_operation_jobs_requester
  ON bulk_operation_jobs (requested_by, created_at DESC);

ALTER TABLE bulk_operation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_operation_jobs_read_own_or_admin ON bulk_operation_jobs;
CREATE POLICY bulk_operation_jobs_read_own_or_admin
  ON bulk_operation_jobs
  FOR SELECT
  USING (
    auth.uid() = requested_by
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS bulk_operation_jobs_insert_ops ON bulk_operation_jobs;
CREATE POLICY bulk_operation_jobs_insert_ops
  ON bulk_operation_jobs
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS bulk_operation_jobs_update_admin ON bulk_operation_jobs;
CREATE POLICY bulk_operation_jobs_update_admin
  ON bulk_operation_jobs
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- -----------------------------
-- 6) updated_at triggers
-- -----------------------------
DO $$ BEGIN
  CREATE TRIGGER trg_saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_integration_connectors_updated_at
  BEFORE UPDATE ON integration_connectors
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_permission_templates_updated_at
  BEFORE UPDATE ON permission_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_training_articles_updated_at
  BEFORE UPDATE ON training_articles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

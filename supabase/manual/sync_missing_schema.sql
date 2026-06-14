-- ============================================================================
-- Manual schema-sync for drifted live DB (Track 3 / drift fix)
-- Reproduces, idempotently, the objects missing from the live database:
--   - clients, ot_templates, ot_drafts, ot_attachments, ot_approvals (+ enum)
--   - ots.client_id, ots.template_id
--   - user_roles.department, user_roles.manager_domain
-- Source migrations:
--   20260303130000_ot_clients_templates_drafts_approvals.sql
--   20260523160000_user_roles_add_department_manager_domain.sql
--
-- Safe to run repeatedly: every statement is guarded. Run in the Supabase
-- SQL Editor (or psql). Take a DB backup first.
-- ============================================================================

BEGIN;

-- Extensions needed by gen_random_uuid() and the trigram index.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. Clients ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  rut           TEXT,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,
  payment_terms TEXT DEFAULT '30 días',
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index needs pg_trgm; tolerate its absence (btree fallback below).
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_clients_name ON clients USING gin (name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping gin trigram index on clients.name: %', SQLERRM;
END $$;
CREATE INDEX IF NOT EXISTS idx_clients_name_btree ON clients (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_rut ON clients (rut) WHERE rut IS NOT NULL AND rut <> '';

ALTER TABLE ots ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ots_client_id ON ots (client_id);

-- ─── 2. OT Templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  description        TEXT,
  product_type       ot_product_type,
  substrate_type     ot_substrate_type,
  grammage_gsm       INTEGER,
  width_cm           NUMERIC(10,2),
  height_cm          NUMERIC(10,2),
  color_front        ot_color_mode DEFAULT 'cmyk',
  color_back         ot_color_mode DEFAULT 'sin_impresion',
  finishes           JSONB DEFAULT '{}',
  default_operations JSONB DEFAULT '[]',
  margin_pct         NUMERIC(5,2) DEFAULT 10,
  increment_pct      NUMERIC(5,2) DEFAULT 10,
  commission_pct     NUMERIC(5,2) DEFAULT 1,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ot_templates_active ON ot_templates (is_active) WHERE is_active = TRUE;

-- ─── 3. OT Drafts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_drafts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  title      TEXT,
  form_data  JSONB NOT NULL DEFAULT '{}',
  step       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ot_drafts_user ON ot_drafts (user_id, updated_at DESC);

-- ─── 4. OT Attachments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id        UUID REFERENCES ots(id) ON DELETE CASCADE,
  draft_id     UUID REFERENCES ot_drafts(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size    INTEGER,
  mime_type    TEXT,
  uploaded_by  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attachment_belongs_to_ot_or_draft CHECK (ot_id IS NOT NULL OR draft_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ot_attachments_ot ON ot_attachments (ot_id) WHERE ot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ot_attachments_draft ON ot_attachments (draft_id) WHERE draft_id IS NOT NULL;

-- ─── 5. Approvals ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ot_approval_status AS ENUM ('pending','approved','rejected','revision_requested');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ot_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id        UUID NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  requested_by UUID,
  approver_id  UUID,
  status       ot_approval_status NOT NULL DEFAULT 'pending',
  comments     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_ot ON ot_approvals (ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_status ON ot_approvals (status) WHERE status = 'pending';

ALTER TABLE ots ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES ot_templates(id) ON DELETE SET NULL;

-- ─── 6. updated_at trigger helper + triggers ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_ot_templates_updated_at BEFORE UPDATE ON ot_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_ot_drafts_updated_at BEFORE UPDATE ON ot_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 7. user_roles columns ──────────────────────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department     TEXT,
  ADD COLUMN IF NOT EXISTS manager_domain TEXT;

COMMIT;

-- ============================================================================
-- OPTIONAL demo seed data (clients + templates). Skip on production.
-- Uncomment to run; ON CONFLICT DO NOTHING makes it idempotent.
-- ============================================================================
-- INSERT INTO clients (name, rut, contact_name, phone, email, payment_terms) VALUES
--   ('Gatorade Chile', '76.123.456-7', 'Carlos Méndez', '+56 9 1234 5678', 'carlos@gatorade.cl', '30 días')
-- ON CONFLICT DO NOTHING;

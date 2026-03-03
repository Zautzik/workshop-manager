-- ================================================================
-- OT Upgrades: Clients, Templates, Drafts, Attachments, Approvals
-- ================================================================

-- ─── 1. Clients master table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  rut         TEXT,  -- Chilean tax ID
  contact_name TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  payment_terms TEXT DEFAULT '30 días',
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients USING gin (name gin_trgm_ops);
-- Note: If pg_trgm is not enabled, the GIN index above will fail.
-- Use a simple btree fallback:
CREATE INDEX IF NOT EXISTS idx_clients_name_btree ON clients (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_rut ON clients (rut) WHERE rut IS NOT NULL AND rut <> '';

-- Add client_id FK to ots
ALTER TABLE ots ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ots_client_id ON ots (client_id);

-- ─── 2. OT Templates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  product_type    ot_product_type,
  substrate_type  ot_substrate_type,
  grammage_gsm    INTEGER,
  width_cm        NUMERIC(10,2),
  height_cm       NUMERIC(10,2),
  color_front     ot_color_mode DEFAULT 'cmyk',
  color_back      ot_color_mode DEFAULT 'sin_impresion',
  finishes        JSONB DEFAULT '{}',
  default_operations JSONB DEFAULT '[]',          -- [{category,name,unit,unit_cost}]
  margin_pct      NUMERIC(5,2) DEFAULT 10,
  increment_pct   NUMERIC(5,2) DEFAULT 10,
  commission_pct  NUMERIC(5,2) DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_templates_active ON ot_templates (is_active) WHERE is_active = TRUE;

-- ─── 3. OT Drafts (auto-save) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  title       TEXT,                               -- auto-generated from client+product
  form_data   JSONB NOT NULL DEFAULT '{}',        -- serialized OTFormData
  step        INTEGER NOT NULL DEFAULT 0,         -- last wizard step
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_drafts_user ON ot_drafts (user_id, updated_at DESC);

-- ─── 4. OT Attachments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id         UUID REFERENCES ots(id) ON DELETE CASCADE,
  draft_id      UUID REFERENCES ot_drafts(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  file_size     INTEGER,                          -- bytes
  mime_type     TEXT,
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attachment_belongs_to_ot_or_draft CHECK (ot_id IS NOT NULL OR draft_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ot_attachments_ot ON ot_attachments (ot_id) WHERE ot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ot_attachments_draft ON ot_attachments (draft_id) WHERE draft_id IS NOT NULL;

-- ─── 5. Approval Workflow ───────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ot_approval_status AS ENUM ('pending','approved','rejected','revision_requested');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ot_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id         UUID NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  requested_by  UUID,
  approver_id   UUID,
  status        ot_approval_status NOT NULL DEFAULT 'pending',
  comments      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ot_approvals_ot ON ot_approvals (ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_status ON ot_approvals (status) WHERE status = 'pending';

-- ─── 6. Add template_id to ots ──────────────────────────────────
ALTER TABLE ots ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES ot_templates(id) ON DELETE SET NULL;

-- ─── 7. Utility: updated_at trigger reuse ──────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ot_templates_updated_at BEFORE UPDATE ON ot_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ot_drafts_updated_at BEFORE UPDATE ON ot_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Seed some example clients ─────────────────────────────────
INSERT INTO clients (name, rut, contact_name, phone, email, payment_terms) VALUES
  ('Gatorade Chile', '76.123.456-7', 'Carlos Méndez', '+56 9 1234 5678', 'carlos@gatorade.cl', '30 días'),
  ('Coca-Cola FEMSA', '76.234.567-8', 'Ana López', '+56 9 2345 6789', 'ana.lopez@femsa.cl', '60 días'),
  ('Viña Concha y Toro', '76.345.678-9', 'Roberto Soto', '+56 9 3456 7890', 'rsoto@conchaytoro.cl', '30 días'),
  ('Farmacias Ahumada', '76.456.789-0', 'María García', '+56 9 4567 8901', 'mgarcia@fasa.cl', '45 días'),
  ('Nestlé Chile', '76.567.890-1', 'Pedro Muñoz', '+56 9 5678 9012', 'pmunoz@nestle.cl', '30 días')
ON CONFLICT DO NOTHING;

-- ─── Seed example templates ────────────────────────────────────
INSERT INTO ot_templates (name, description, product_type, substrate_type, grammage_gsm, width_cm, height_cm, color_front, color_back, finishes, default_operations, margin_pct, increment_pct, commission_pct) VALUES
  (
    'Etiqueta Estándar',
    'Etiqueta CMYK en couché con troquelado y barniz',
    'etiqueta', 'couche', 150, 10, 7,
    'cmyk', 'sin_impresion',
    '{"finish_troquelado": true, "finish_barniz": true}',
    '[{"category":"materiales","name":"Papel Couché 150g","unit":"kg","unit_cost":2800},{"category":"impresion","name":"Impresión Offset 4/0","unit":"pliego","unit_cost":45},{"category":"terminaciones","name":"Troquelado","unit":"golpe","unit_cost":30},{"category":"terminaciones","name":"Barniz UV","unit":"pliego","unit_cost":25}]',
    10, 10, 1
  ),
  (
    'Caja Plegadiza Premium',
    'Caja cartulina 300g con CMYK + laminado + troquelado + pegado',
    'caja_plegadiza', 'cartulina', 300, 25, 18,
    'cmyk', 'sin_impresion',
    '{"finish_troquelado": true, "finish_plegado": true, "finish_pegado": true, "finish_laminado": true}',
    '[{"category":"materiales","name":"Cartulina 300g","unit":"kg","unit_cost":3200},{"category":"impresion","name":"Impresión Offset 4/0","unit":"pliego","unit_cost":45},{"category":"terminaciones","name":"Laminado Mate","unit":"pliego","unit_cost":35},{"category":"terminaciones","name":"Troquelado","unit":"golpe","unit_cost":30},{"category":"terminaciones","name":"Pegado","unit":"unidad","unit_cost":15}]',
    15, 10, 2
  ),
  (
    'Volante Económico',
    'Volante 1/4 carta en bond 90g, 4/0',
    'volante', 'bond', 90, 14, 21.6,
    'cmyk', 'sin_impresion',
    '{}',
    '[{"category":"materiales","name":"Papel Bond 90g","unit":"kg","unit_cost":1800},{"category":"impresion","name":"Impresión Offset 4/0","unit":"pliego","unit_cost":45},{"category":"terminaciones","name":"Corte Guillotina","unit":"corte","unit_cost":10}]',
    8, 5, 1
  )
ON CONFLICT DO NOTHING;

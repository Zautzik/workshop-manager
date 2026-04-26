-- =====================================================
-- Machines Rich Profile
-- Adds operational, productivity, energy and location
-- attributes to the machines table so the Machines module
-- (formerly Maintenance) becomes the single source of truth
-- for every piece of equipment in the workshop.
-- =====================================================

-- ─── Extended status values ──────────────────────────
DO $$ BEGIN
  ALTER TYPE public.machine_status ADD VALUE IF NOT EXISTS 'setup';
  ALTER TYPE public.machine_status ADD VALUE IF NOT EXISTS 'breakdown';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─── Rich profile columns on machines ────────────────
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS brand             TEXT,
  ADD COLUMN IF NOT EXISTS model             TEXT,
  ADD COLUMN IF NOT EXISTS serial_number     TEXT,
  ADD COLUMN IF NOT EXISTS year_manufactured INT CHECK (year_manufactured IS NULL OR year_manufactured BETWEEN 1900 AND 2100),
  ADD COLUMN IF NOT EXISTS location          TEXT,          -- Physical spot in the workshop, e.g. "Nave A – Puesto 3"
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS photo_url         TEXT,

  -- Productivity
  ADD COLUMN IF NOT EXISTS nominal_speed_sheets_hr  INT CHECK (nominal_speed_sheets_hr IS NULL OR nominal_speed_sheets_hr >= 0),
  ADD COLUMN IF NOT EXISTS optimal_speed_sheets_hr  INT CHECK (optimal_speed_sheets_hr IS NULL OR optimal_speed_sheets_hr >= 0),
  ADD COLUMN IF NOT EXISTS max_print_width_mm        NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS max_print_height_mm       NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS colors                    INT DEFAULT 1 CHECK (colors IS NULL OR colors BETWEEN 1 AND 12),

  -- Energy & operating costs
  ADD COLUMN IF NOT EXISTS power_kw                  NUMERIC(8,3) CHECK (power_kw IS NULL OR power_kw >= 0),
  ADD COLUMN IF NOT EXISTS energy_cost_per_hr        NUMERIC(10,4) CHECK (energy_cost_per_hr IS NULL OR energy_cost_per_hr >= 0),
  ADD COLUMN IF NOT EXISTS maintenance_cost_monthly  NUMERIC(12,2) CHECK (maintenance_cost_monthly IS NULL OR maintenance_cost_monthly >= 0),
  ADD COLUMN IF NOT EXISTS depreciation_monthly      NUMERIC(12,2) CHECK (depreciation_monthly IS NULL OR depreciation_monthly >= 0),

  -- Availability
  ADD COLUMN IF NOT EXISTS is_active                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workstation_id            UUID REFERENCES public.workstations(id) ON DELETE SET NULL;

-- Index for active machines used in Planta
CREATE INDEX IF NOT EXISTS idx_machines_active       ON public.machines(is_active);
CREATE INDEX IF NOT EXISTS idx_machines_type         ON public.machines(type);
CREATE INDEX IF NOT EXISTS idx_machines_workstation  ON public.machines(workstation_id);

-- ─── Machine → Inventory supplies junction ───────────
-- Describes which inventory items each machine regularly
-- consumes and at what rate (per hour or per 1000 sheets).
CREATE TABLE IF NOT EXISTS public.machine_supply_requirements (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id        UUID        NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  inventory_item_id UUID        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  consumption_rate  NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (consumption_rate >= 0),
  rate_unit         TEXT        NOT NULL DEFAULT 'per_1000_sheets', -- 'per_hour' | 'per_1000_sheets' | 'per_job'
  notes             TEXT,
  is_critical       BOOLEAN     NOT NULL DEFAULT false,   -- Flags items that stop the machine when out of stock
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_supply_machine   ON public.machine_supply_requirements(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_supply_item      ON public.machine_supply_requirements(inventory_item_id);

ALTER TABLE public.machine_supply_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine_supply_select" ON public.machine_supply_requirements;
DROP POLICY IF EXISTS "machine_supply_all"    ON public.machine_supply_requirements;

CREATE POLICY "machine_supply_select" ON public.machine_supply_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "machine_supply_all" ON public.machine_supply_requirements
  FOR ALL    TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role)
  );

-- ─── Machine operating costs history ─────────────────
-- Tracks real costs (energy bills, service invoices) per machine per month.
CREATE TABLE IF NOT EXISTS public.machine_cost_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id        UUID        NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  period_month      DATE        NOT NULL,  -- First day of the month, e.g. 2026-04-01
  energy_kwh        NUMERIC(12,3),
  energy_cost       NUMERIC(12,2),
  maintenance_cost  NUMERIC(12,2),
  supplies_cost     NUMERIC(12,2),
  other_cost        NUMERIC(12,2),
  notes             TEXT,
  recorded_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_machine_cost_machine  ON public.machine_cost_entries(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_cost_period   ON public.machine_cost_entries(period_month DESC);

ALTER TABLE public.machine_cost_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine_cost_select" ON public.machine_cost_entries;
DROP POLICY IF EXISTS "machine_cost_all"    ON public.machine_cost_entries;

CREATE POLICY "machine_cost_select" ON public.machine_cost_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "machine_cost_all" ON public.machine_cost_entries
  FOR ALL    TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role)
  );

-- ─── updated_at trigger ───────────────────────────────
DROP TRIGGER IF EXISTS machine_supply_requirements_updated_at ON public.machine_supply_requirements;
CREATE TRIGGER machine_supply_requirements_updated_at
  BEFORE UPDATE ON public.machine_supply_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

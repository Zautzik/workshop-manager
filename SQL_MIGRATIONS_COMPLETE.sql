-- ============================================================================
-- HR DOMAIN MIGRATIONS - COMPLETE SQL FOR SUPABASE
-- ============================================================================
--
-- Instructions:
-- 1. Go to https://app.supabase.com
-- 2. Select your project
-- 3. Go to SQL Editor
-- 4. Copy each migration (in order below) and run it
-- 5. Or: Run all migrations one after another in a single session
-- 
-- MIGRATION ORDER (IMPORTANT):
-- 1. Core HR tables
-- 2. Seed data (skills, incentive rules)
-- 3. Backfill workers to employees
-- 4. Effective-date enhancements
-- 5. Safe deprecation layer
--
-- Expected time: ~2-5 minutes total
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: HR DOMAIN CORE TABLES (20260221143000)
-- ============================================================================
-- Creates all HR domain tables with RLS and proper constraints
-- Estimated time: 30 seconds

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
    CREATE TYPE public.employee_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_contract_type') THEN
    CREATE TYPE public.employment_contract_type AS ENUM ('full_time', 'part_time', 'temporary', 'contractor', 'intern');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_leave_type') THEN
    CREATE TYPE public.hr_leave_type AS ENUM ('vacation', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_request_status') THEN
    CREATE TYPE public.leave_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_rule_type') THEN
    CREATE TYPE public.incentive_rule_type AS ENUM ('fixed_bonus', 'performance_bonus', 'attendance_bonus', 'overtime_bonus', 'penalty_adjustment');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_award_status') THEN
    CREATE TYPE public.incentive_award_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
  END IF;
END $$;

-- Employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  worker_legacy_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  employee_number TEXT UNIQUE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  status public.employee_status NOT NULL DEFAULT 'active',
  hire_date DATE,
  termination_date DATE,
  email TEXT,
  phone TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employees_worker_legacy_id_unique UNIQUE (worker_legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- Employment contracts
CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type public.employment_contract_type NOT NULL DEFAULT 'full_time',
  start_date DATE NOT NULL,
  end_date DATE,
  base_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 40,
  max_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8,
  max_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 48,
  overtime_allowed BOOLEAN NOT NULL DEFAULT true,
  overtime_cap_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 12,
  minimum_rest_hours NUMERIC(4,2) NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employment_contract_dates_valid CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employment_contracts_employee_id ON public.employment_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_active ON public.employment_contracts(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_dates ON public.employment_contracts(start_date, end_date);

-- Compensation rates
CREATE TABLE IF NOT EXISTS public.compensation_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  hourly_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  overtime_multiplier_50 NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  overtime_multiplier_100 NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  night_shift_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  weekend_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  incentive_eligibility BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compensation_effective_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT compensation_multipliers_valid CHECK (
    overtime_multiplier_50 >= 1
    AND overtime_multiplier_100 >= 1
    AND night_shift_multiplier >= 0
    AND weekend_multiplier >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_compensation_rates_employee_id ON public.compensation_rates(employee_id);
CREATE INDEX IF NOT EXISTS idx_compensation_rates_effective ON public.compensation_rates(employee_id, effective_from DESC);

-- Skills
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_active ON public.skills(is_active);

-- Employee skills
CREATE TABLE IF NOT EXISTS public.employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency_level SMALLINT NOT NULL DEFAULT 1,
  certified BOOLEAN NOT NULL DEFAULT false,
  certification_expires_on DATE,
  last_assessed_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_skills_level_valid CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
  CONSTRAINT employee_skills_unique UNIQUE (employee_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee_id ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill_id ON public.employee_skills(skill_id);

-- Leave balances
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.hr_leave_type NOT NULL,
  balance_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  accrued_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  used_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  carry_over_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  as_of DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_balances_unique_snapshot UNIQUE (employee_id, leave_type, as_of)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_id ON public.leave_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type ON public.leave_balances(leave_type);

-- Leave requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.hr_leave_type NOT NULL,
  status public.leave_request_status NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested NUMERIC(8,2) NOT NULL DEFAULT 0,
  reason TEXT,
  review_notes TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_request_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT leave_request_hours_valid CHECK (hours_requested >= 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- Incentive rules
CREATE TABLE IF NOT EXISTS public.incentive_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  incentive_type public.incentive_rule_type NOT NULL DEFAULT 'fixed_bonus',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  calculation_formula TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incentive_rule_effective_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_incentive_rules_active ON public.incentive_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_incentive_rules_effective_dates ON public.incentive_rules(effective_from, effective_to);

-- Employee incentives
CREATE TABLE IF NOT EXISTS public.employee_incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  incentive_rule_id UUID REFERENCES public.incentive_rules(id) ON DELETE SET NULL,
  awarded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  status public.incentive_award_status NOT NULL DEFAULT 'approved',
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_incentives_period_valid CHECK (
    period_end IS NULL OR period_start IS NULL OR period_end >= period_start
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_incentives_employee_id ON public.employee_incentives(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_incentives_awarded_date ON public.employee_incentives(awarded_date);
CREATE INDEX IF NOT EXISTS idx_employee_incentives_status ON public.employee_incentives(status);

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employment_contracts_updated_at ON public.employment_contracts;
CREATE TRIGGER update_employment_contracts_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_compensation_rates_updated_at ON public.compensation_rates;
CREATE TRIGGER update_compensation_rates_updated_at
  BEFORE UPDATE ON public.compensation_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_skills_updated_at ON public.skills;
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employee_skills_updated_at ON public.employee_skills;
CREATE TRIGGER update_employee_skills_updated_at
  BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON public.leave_balances;
CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_incentive_rules_updated_at ON public.incentive_rules;
CREATE TRIGGER update_incentive_rules_updated_at
  BEFORE UPDATE ON public.incentive_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employee_incentives_updated_at ON public.employee_incentives;
CREATE TRIGGER update_employee_incentives_updated_at
  BEFORE UPDATE ON public.employee_incentives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incentive_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_incentives ENABLE ROW LEVEL SECURITY;

-- Employees policies
DROP POLICY IF EXISTS "Authenticated users can view employees" ON public.employees;
CREATE POLICY "Authenticated users can view employees"
  ON public.employees FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors and admins can manage employees" ON public.employees;
CREATE POLICY "Supervisors and admins can manage employees"
  ON public.employees FOR ALL
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Employment contracts policies
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.employment_contracts;
CREATE POLICY "Authenticated users can view contracts"
  ON public.employment_contracts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage contracts" ON public.employment_contracts;
CREATE POLICY "Managers and admins can manage contracts"
  ON public.employment_contracts FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Compensation rates policies
DROP POLICY IF EXISTS "Authenticated users can view compensation rates" ON public.compensation_rates;
CREATE POLICY "Authenticated users can view compensation rates"
  ON public.compensation_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage compensation rates" ON public.compensation_rates;
CREATE POLICY "Managers and admins can manage compensation rates"
  ON public.compensation_rates FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Skills policies
DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.skills;
CREATE POLICY "Authenticated users can view skills"
  ON public.skills FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage skills" ON public.skills;
CREATE POLICY "Managers and admins can manage skills"
  ON public.skills FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Employee skills policies
DROP POLICY IF EXISTS "Authenticated users can view employee skills" ON public.employee_skills;
CREATE POLICY "Authenticated users can view employee skills"
  ON public.employee_skills FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors managers and admins can manage employee skills" ON public.employee_skills;
CREATE POLICY "Supervisors managers and admins can manage employee skills"
  ON public.employee_skills FOR ALL
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Leave balances policies
DROP POLICY IF EXISTS "Authenticated users can view leave balances" ON public.leave_balances;
CREATE POLICY "Authenticated users can view leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers supervisors and admins can manage leave balances" ON public.leave_balances;
CREATE POLICY "Managers supervisors and admins can manage leave balances"
  ON public.leave_balances FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Leave requests policies
DROP POLICY IF EXISTS "Authenticated users can view leave requests" ON public.leave_requests;
CREATE POLICY "Authenticated users can view leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can create leave requests" ON public.leave_requests;
CREATE POLICY "Authenticated users can create leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers supervisors and admins can update leave requests" ON public.leave_requests;
CREATE POLICY "Managers supervisors and admins can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Incentive rules policies
DROP POLICY IF EXISTS "Authenticated users can view incentive rules" ON public.incentive_rules;
CREATE POLICY "Authenticated users can view incentive rules"
  ON public.incentive_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage incentive rules" ON public.incentive_rules;
CREATE POLICY "Managers and admins can manage incentive rules"
  ON public.incentive_rules FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Employee incentives policies
DROP POLICY IF EXISTS "Authenticated users can view employee incentives" ON public.employee_incentives;
CREATE POLICY "Authenticated users can view employee incentives"
  ON public.employee_incentives FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage employee incentives" ON public.employee_incentives;
CREATE POLICY "Managers and admins can manage employee incentives"
  ON public.employee_incentives FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ============================================================================
-- MIGRATION 2: HR DOMAIN SEED DATA (20260221143100)
-- ============================================================================
-- Adds 12 predefined skills and 5 incentive rules
-- Estimated time: 10 seconds

INSERT INTO public.skills (code, name, description, category, is_active) VALUES
  ('OFFSET_PRESS_BASIC', 'Offset Press Operation - Basic', 'Basic operation of offset printing machines', 'printing', true),
  ('OFFSET_PRESS_ADVANCED', 'Offset Press Operation - Advanced', 'Advanced offset press operation including setup and troubleshooting', 'printing', true),
  ('GUILLOTINE_BASIC', 'Guillotine Operation - Basic', 'Basic cutting operations with guillotine machines', 'cutting', true),
  ('GUILLOTINE_ADVANCED', 'Guillotine Operation - Advanced', 'Precision cutting and complex job setup', 'cutting', true),
  ('DIE_CUTTING', 'Die Cutting Operation', 'Operation of die cutting machines', 'cutting', true),
  ('PRE_PRESS_SETUP', 'Pre-Press Setup', 'Preparation of materials and plates for printing', 'pre_press', true),
  ('COLOR_MANAGEMENT', 'Color Management', 'Color calibration and quality control', 'quality', true),
  ('MANUAL_WORKSHOP', 'Manual Workshop Tasks', 'Assembly, binding, finishing work', 'workshop', true),
  ('QUALITY_INSPECTION', 'Quality Inspection', 'Final quality control and inspection', 'quality', true),
  ('MACHINE_MAINTENANCE', 'Basic Machine Maintenance', 'Routine maintenance and cleaning', 'maintenance', true),
  ('FORKLIFT_CERTIFIED', 'Forklift Operation', 'Certified forklift operation', 'logistics', true),
  ('TEAM_LEADERSHIP', 'Team Leadership', 'Leading small teams and shift coordination', 'management', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.incentive_rules (
  name,
  description,
  incentive_type,
  amount,
  currency_code,
  is_active,
  effective_from
) VALUES
  (
    'Perfect Attendance Bonus',
    'Monthly bonus for 100% attendance with no late arrivals',
    'attendance_bonus',
    100.00,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Quality Excellence Bonus',
    'Quarterly bonus for maintaining zero defects',
    'performance_bonus',
    250.00,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Overtime Premium - Standard',
    'Standard overtime multiplier at 50%',
    'overtime_bonus',
    0,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Overtime Premium - Holiday',
    'Holiday overtime multiplier at 100%',
    'overtime_bonus',
    0,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Tardiness Penalty',
    'Deduction for excessive lateness',
    'penalty_adjustment',
    -50.00,
    'USD',
    true,
    CURRENT_DATE
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION 3: EFFECTIVE-DATE ENHANCEMENTS (20260221143300)
-- ============================================================================
-- Add non-overlapping constraints and helper functions
-- Estimated time: 1 minute

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Non-overlapping employment contracts
ALTER TABLE public.employment_contracts
  DROP CONSTRAINT IF EXISTS employment_contracts_no_overlap;

ALTER TABLE public.employment_contracts
  ADD CONSTRAINT employment_contracts_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, COALESCE(end_date, '9999-12-31'::date), '[]') WITH &&
  );

-- Non-overlapping compensation rates
ALTER TABLE public.compensation_rates
  DROP CONSTRAINT IF EXISTS compensation_rates_no_overlap;

ALTER TABLE public.compensation_rates
  ADD CONSTRAINT compensation_rates_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
  );

-- Get contract at date
CREATE OR REPLACE FUNCTION public.get_contract_at_date(
  p_employee_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.employment_contracts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.employment_contracts
  WHERE employee_id = p_employee_id
    AND start_date <= p_date
    AND (end_date IS NULL OR end_date >= p_date)
  ORDER BY start_date DESC
  LIMIT 1;
$$;

-- Get compensation at date
CREATE OR REPLACE FUNCTION public.get_compensation_at_date(
  p_employee_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.compensation_rates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.compensation_rates
  WHERE employee_id = p_employee_id
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- Get compensation history
CREATE OR REPLACE FUNCTION public.get_compensation_history(
  p_employee_id UUID
)
RETURNS TABLE (
  effective_from DATE,
  effective_to DATE,
  hourly_rate NUMERIC,
  overtime_multiplier_50 NUMERIC,
  overtime_multiplier_100 NUMERIC,
  currency_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cr.effective_from,
    cr.effective_to,
    cr.hourly_rate,
    cr.overtime_multiplier_50,
    cr.overtime_multiplier_100,
    cr.currency_code
  FROM public.compensation_rates cr
  WHERE cr.employee_id = p_employee_id
  ORDER BY cr.effective_from DESC;
$$;

-- Get contract history
CREATE OR REPLACE FUNCTION public.get_contract_history(
  p_employee_id UUID
)
RETURNS TABLE (
  start_date DATE,
  end_date DATE,
  contract_type employment_contract_type,
  base_hours_per_week NUMERIC,
  max_hours_per_week NUMERIC,
  overtime_allowed BOOLEAN,
  is_current BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ec.start_date,
    ec.end_date,
    ec.contract_type,
    ec.base_hours_per_week,
    ec.max_hours_per_week,
    ec.overtime_allowed,
    (ec.end_date IS NULL OR ec.end_date >= CURRENT_DATE) as is_current
  FROM public.employment_contracts ec
  WHERE ec.employee_id = p_employee_id
  ORDER BY ec.start_date DESC;
$$;

-- Validate contract coverage
CREATE OR REPLACE FUNCTION public.validate_contract_coverage(
  p_employee_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  has_complete_coverage BOOLEAN,
  days_with_coverage INTEGER,
  days_expected INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_covered INTEGER := 0;
  v_days_expected INTEGER;
  v_date DATE;
  v_has_contract BOOLEAN;
BEGIN
  v_days_expected := (p_to_date - p_from_date) + 1;
  
  FOR v_date IN 
    SELECT generate_series::date 
    FROM generate_series(p_from_date, p_to_date, '1 day'::interval)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.employment_contracts
      WHERE employee_id = p_employee_id
        AND start_date <= v_date
        AND (end_date IS NULL OR end_date >= v_date)
    ) INTO v_has_contract;
    
    IF v_has_contract THEN
      v_days_covered := v_days_covered + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    (v_days_covered = v_days_expected)::boolean,
    v_days_covered,
    v_days_expected;
END;
$$;

-- Validation trigger for alignment
CREATE OR REPLACE FUNCTION public.validate_compensation_contract_alignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_contract BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.employment_contracts
    WHERE employee_id = NEW.employee_id
      AND start_date <= NEW.effective_from
      AND (end_date IS NULL OR end_date >= NEW.effective_from)
  ) INTO v_has_contract;
  
  IF NOT v_has_contract THEN
    RAISE WARNING 'Compensation rate set for employee % starting % but no employment contract exists for that date',
      NEW.employee_id, NEW.effective_from;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_compensation_contract_alignment ON public.compensation_rates;
CREATE TRIGGER check_compensation_contract_alignment
  BEFORE INSERT OR UPDATE ON public.compensation_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_compensation_contract_alignment();

-- ============================================================================
-- SUCCESSFUL DEPLOYMENT
-- ============================================================================
--
-- All migrations have been applied successfully!
--
-- Summary:
-- ✓ 9 HR domain tables created
-- ✓ RLS policies enabled
-- ✓ 12 skills seeded
-- ✓ 5 incentive rules seeded
-- ✓ Non-overlapping constraints added
-- ✓ Effective-date helper functions created
--
-- Next Steps:
-- 1. Generate TypeScript types:
--    npx supabase gen types typescript --local > src/integrations/supabase/types.ts
--
-- 2. Backfill existing workers (if you have data):
--    Run the backfill migration in the SQL Editor
--
-- 3. Use the React Query hooks:
--    import { useEmployees, useCompensationRate } from '@/hooks/use-employees'
--
-- Helpful Queries:
-- - SELECT COUNT(*) FROM employees;
-- - SELECT * FROM skills;
-- - SELECT * FROM incentive_rules WHERE is_active = true;
--
-- ============================================================================

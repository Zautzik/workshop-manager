-- ============================================================================
-- HR DOMAIN - COMPLETE MIGRATION (CORE + SEED DATA)
-- ============================================================================
-- This file contains EVERYTHING needed to set up the HR domain from scratch
-- Run this ONCE in Supabase SQL Editor
-- 
-- Estimated time: 2-3 minutes
-- ============================================================================

-- Step 1: Create all enums
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
    CREATE TYPE public.employee_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
    RAISE NOTICE 'Created employee_status enum';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_contract_type') THEN
    CREATE TYPE public.employment_contract_type AS ENUM ('full_time', 'part_time', 'temporary', 'contractor', 'intern');
    RAISE NOTICE 'Created employment_contract_type enum';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_leave_type') THEN
    CREATE TYPE public.hr_leave_type AS ENUM ('vacation', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other');
    RAISE NOTICE 'Created hr_leave_type enum';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_request_status') THEN
    CREATE TYPE public.leave_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    RAISE NOTICE 'Created leave_request_status enum';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_rule_type') THEN
    CREATE TYPE public.incentive_rule_type AS ENUM ('fixed_bonus', 'performance_bonus', 'attendance_bonus', 'overtime_bonus', 'penalty_adjustment');
    RAISE NOTICE 'Created incentive_rule_type enum';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_rule_type') THEN
    ALTER TYPE public.incentive_rule_type ADD VALUE IF NOT EXISTS 'fixed_bonus';
    ALTER TYPE public.incentive_rule_type ADD VALUE IF NOT EXISTS 'performance_bonus';
    ALTER TYPE public.incentive_rule_type ADD VALUE IF NOT EXISTS 'attendance_bonus';
    ALTER TYPE public.incentive_rule_type ADD VALUE IF NOT EXISTS 'overtime_bonus';
    ALTER TYPE public.incentive_rule_type ADD VALUE IF NOT EXISTS 'penalty_adjustment';
  END IF;
END $$;

-- Commit so newly added enum values are usable in subsequent DDL in this script.
COMMIT;
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_award_status') THEN
    CREATE TYPE public.incentive_award_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
    RAISE NOTICE 'Created incentive_award_status enum';
  END IF;
END $$;

-- Step 2: Create core tables
-- ============================================================================

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

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view employees" ON public.employees;
CREATE POLICY "Authenticated users can view employees"
  ON public.employees FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created employees table';
END $$;

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

DROP TRIGGER IF EXISTS update_employment_contracts_updated_at ON public.employment_contracts;
CREATE TRIGGER update_employment_contracts_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.employment_contracts;
CREATE POLICY "Authenticated users can view contracts"
  ON public.employment_contracts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created employment_contracts table';
END $$;

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
    overtime_multiplier_50 >= 1 AND overtime_multiplier_100 >= 1 AND night_shift_multiplier >= 0 AND weekend_multiplier >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_compensation_rates_employee_id ON public.compensation_rates(employee_id);
CREATE INDEX IF NOT EXISTS idx_compensation_rates_effective ON public.compensation_rates(employee_id, effective_from DESC);

DROP TRIGGER IF EXISTS update_compensation_rates_updated_at ON public.compensation_rates;
CREATE TRIGGER update_compensation_rates_updated_at
  BEFORE UPDATE ON public.compensation_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compensation_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view compensation rates" ON public.compensation_rates;
CREATE POLICY "Authenticated users can view compensation rates"
  ON public.compensation_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created compensation_rates table';
END $$;

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

DROP TRIGGER IF EXISTS update_skills_updated_at ON public.skills;
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.skills;
CREATE POLICY "Authenticated users can view skills"
  ON public.skills FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created skills table';
END $$;

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

DROP TRIGGER IF EXISTS update_employee_skills_updated_at ON public.employee_skills;
CREATE TRIGGER update_employee_skills_updated_at
  BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view employee skills" ON public.employee_skills;
CREATE POLICY "Authenticated users can view employee skills"
  ON public.employee_skills FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created employee_skills table';
END $$;

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

DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON public.leave_balances;
CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view leave balances" ON public.leave_balances;
CREATE POLICY "Authenticated users can view leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created leave_balances table';
END $$;

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

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view leave requests" ON public.leave_requests;
CREATE POLICY "Authenticated users can view leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created leave_requests table';
END $$;

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

DROP TRIGGER IF EXISTS update_incentive_rules_updated_at ON public.incentive_rules;
CREATE TRIGGER update_incentive_rules_updated_at
  BEFORE UPDATE ON public.incentive_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.incentive_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view incentive rules" ON public.incentive_rules;
CREATE POLICY "Authenticated users can view incentive rules"
  ON public.incentive_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created incentive_rules table';
END $$;

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
  CONSTRAINT employee_incentives_period_valid CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_employee_incentives_employee_id ON public.employee_incentives(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_incentives_awarded_date ON public.employee_incentives(awarded_date);
CREATE INDEX IF NOT EXISTS idx_employee_incentives_status ON public.employee_incentives(status);

DROP TRIGGER IF EXISTS update_employee_incentives_updated_at ON public.employee_incentives;
CREATE TRIGGER update_employee_incentives_updated_at
  BEFORE UPDATE ON public.employee_incentives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view employee incentives" ON public.employee_incentives;
CREATE POLICY "Authenticated users can view employee incentives"
  ON public.employee_incentives FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  RAISE NOTICE 'Created employee_incentives table';
END $$;

-- Step 3: Seed data - Skills
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== INSERTING SEED DATA ===';
END $$;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('OFFSET_PRESS_BASIC', 'Offset Press Operation - Basic', 'Basic operation of offset printing machines', 'printing', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('OFFSET_PRESS_ADVANCED', 'Offset Press Operation - Advanced', 'Advanced offset press operation including setup and troubleshooting', 'printing', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('GUILLOTINE_BASIC', 'Guillotine Operation - Basic', 'Basic cutting operations with guillotine machines', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('GUILLOTINE_ADVANCED', 'Guillotine Operation - Advanced', 'Precision cutting and complex job setup', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('DIE_CUTTING', 'Die Cutting Operation', 'Operation of die cutting machines', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('PRE_PRESS_SETUP', 'Pre-Press Setup', 'Preparation of materials and plates for printing', 'pre_press', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('COLOR_MANAGEMENT', 'Color Management', 'Color calibration and quality control', 'quality', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('MANUAL_WORKSHOP', 'Manual Workshop Tasks', 'Assembly, binding, finishing work', 'workshop', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('QUALITY_INSPECTION', 'Quality Inspection', 'Final quality control and inspection', 'quality', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('MACHINE_MAINTENANCE', 'Basic Machine Maintenance', 'Routine maintenance and cleaning', 'maintenance', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('FORKLIFT_CERTIFIED', 'Forklift Operation', 'Certified forklift operation', 'logistics', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('TEAM_LEADERSHIP', 'Team Leadership', 'Leading small teams and shift coordination', 'management', true)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Inserted skills - Current count: % ', (SELECT COUNT(*) FROM public.skills);
END $$;

-- Step 4: Seed data - Incentive rules
-- ============================================================================

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES ('Perfect Attendance Bonus', 'Monthly bonus for 100% attendance with no late arrivals', 'attendance_bonus'::public.incentive_rule_type, 100.00, 'USD', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES ('Quality Excellence Bonus', 'Quarterly bonus for maintaining zero defects', 'performance_bonus'::public.incentive_rule_type, 250.00, 'USD', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES ('Overtime Premium - Standard', 'Standard overtime multiplier at 50%', 'overtime_bonus'::public.incentive_rule_type, 0, 'USD', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES ('Overtime Premium - Holiday', 'Holiday overtime multiplier at 100%', 'overtime_bonus'::public.incentive_rule_type, 0, 'USD', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES ('Tardiness Penalty', 'Deduction for excessive lateness', 'penalty_adjustment'::public.incentive_rule_type, -50.00, 'USD', true, CURRENT_DATE)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Inserted incentive rules - Current count: % ', (SELECT COUNT(*) FROM public.incentive_rules);
END $$;

-- Step 5: Final verification
-- ============================================================================

DO $$
DECLARE
  v_skills_count INTEGER;
  v_rules_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_skills_count FROM public.skills;
  SELECT COUNT(*) INTO v_rules_count FROM public.incentive_rules;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║          HR DOMAIN MIGRATION COMPLETE!                     ║';
  RAISE NOTICE '╠════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ ✓ Skills table created and seeded: %                       ║', v_skills_count;
  RAISE NOTICE '║ ✓ Incentive rules table created and seeded: %              ║', v_rules_count;
  RAISE NOTICE '║ ✓ All enums created                                        ║';
  RAISE NOTICE '║ ✓ All indexes created                                      ║';
  RAISE NOTICE '║ ✓ RLS policies enabled                                     ║';
  RAISE NOTICE '║ ✓ Auto-update triggers configured                          ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Generate TypeScript types:';
  RAISE NOTICE '   npx supabase gen types typescript --local > src/integrations/supabase/types.ts';
  RAISE NOTICE '';
  RAISE NOTICE '2. Verify with test queries:';
  RAISE NOTICE '   SELECT * FROM public.skills;';
  RAISE NOTICE '   SELECT * FROM public.incentive_rules WHERE is_active = true;';
  RAISE NOTICE '';
END $$;

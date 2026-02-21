-- HR domain core tables
-- Scope:
-- employees, employment_contracts, compensation_rates, skills, employee_skills,
-- leave_balances, leave_requests, incentive_rules, employee_incentives

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Master profile
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  worker_legacy_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE,
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

-- -----------------------------------------------------------------------------
-- Employment contracts (effective dated)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Compensation rates (effective dated)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Skills
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Leave management
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Incentives
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incentive_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_incentives ENABLE ROW LEVEL SECURITY;

-- Employees
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

-- Employment contracts
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

-- Compensation rates
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

-- Skills
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

-- Employee skills
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

-- Leave balances
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

-- Leave requests
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

-- Incentive rules
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

-- Employee incentives
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

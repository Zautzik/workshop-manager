-- Leave management: accrual policies, balances, and approval flow

-- -----------------------------------------------------------------------------
-- Schema updates for leave balances
-- -----------------------------------------------------------------------------
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS balance_year INTEGER,
  ADD COLUMN IF NOT EXISTS accrual_rate_per_month NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_balance_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accrued_on DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.leave_balances
  ALTER COLUMN balance_year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  ALTER COLUMN last_accrued_on SET DEFAULT CURRENT_DATE;

UPDATE public.leave_balances
SET balance_year = EXTRACT(YEAR FROM as_of)::INTEGER
WHERE balance_year IS NULL;

UPDATE public.leave_balances
SET last_accrued_on = as_of
WHERE last_accrued_on IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year
  ON public.leave_balances(employee_id, balance_year);

-- -----------------------------------------------------------------------------
-- Leave policies (accrual rules)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type public.hr_leave_type NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  initial_balance_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  accrual_rate_per_month NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_balance_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_leave_policies_updated_at ON public.leave_policies;
CREATE TRIGGER update_leave_policies_updated_at
  BEFORE UPDATE ON public.leave_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.leave_policies (leave_type, name, description, initial_balance_hours, accrual_rate_per_month, max_balance_hours, is_active)
VALUES
  ('vacation', 'Vacation', 'Standard vacation accrual', 80, 8, 200, true),
  ('sick', 'Sick', 'Standard sick leave accrual', 40, 4, 80, true),
  ('personal', 'Personal', 'Personal leave', 0, 0, 40, true),
  ('maternity', 'Maternity', 'Maternity leave', 0, 0, 0, true),
  ('paternity', 'Paternity', 'Paternity leave', 0, 0, 0, true),
  ('unpaid', 'Unpaid', 'Unpaid leave (no accrual)', 0, 0, 0, true),
  ('other', 'Other', 'Other leave types', 0, 0, 0, true)
ON CONFLICT (leave_type) DO NOTHING;

ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view leave policies" ON public.leave_policies;
CREATE POLICY "Authenticated users can view leave policies"
  ON public.leave_policies FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage leave policies" ON public.leave_policies;
CREATE POLICY "Managers and admins can manage leave policies"
  ON public.leave_policies FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- -----------------------------------------------------------------------------
-- Helpers: initialize balances and run accrual
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_leave_balances_for_employee(
  p_employee_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO public.leave_balances (
    employee_id,
    leave_type,
    balance_year,
    balance_hours,
    accrual_rate_per_month,
    max_balance_hours,
    as_of,
    notes
  )
  SELECT
    p_employee_id,
    policy.leave_type,
    p_year,
    policy.initial_balance_hours,
    policy.accrual_rate_per_month,
    policy.max_balance_hours,
    make_date(p_year, 1, 1),
    'Initialized from leave policy'
  FROM public.leave_policies policy
  WHERE policy.is_active
    AND NOT EXISTS (
      SELECT 1
      FROM public.leave_balances lb
      WHERE lb.employee_id = p_employee_id
        AND lb.leave_type = policy.leave_type
        AND lb.balance_year = p_year
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_leave_balances_on_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ensure_leave_balances_for_employee(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_leave_balances(
  target_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH eligible AS (
    SELECT
      id,
      accrual_rate_per_month,
      max_balance_hours,
      balance_hours,
      accrued_hours,
      COALESCE(last_accrued_on, target_date) AS last_accrued_on,
      (
        (EXTRACT(YEAR FROM age(target_date, COALESCE(last_accrued_on, target_date)))::INTEGER * 12)
        + EXTRACT(MONTH FROM age(target_date, COALESCE(last_accrued_on, target_date)))::INTEGER
      ) AS months_to_accrue
    FROM public.leave_balances
    WHERE accrual_rate_per_month > 0
  )
  UPDATE public.leave_balances lb
  SET
    accrued_hours = lb.accrued_hours + (eligible.months_to_accrue * lb.accrual_rate_per_month),
    balance_hours = CASE
      WHEN lb.max_balance_hours > 0 THEN
        LEAST(
          lb.balance_hours + (eligible.months_to_accrue * lb.accrual_rate_per_month),
          lb.max_balance_hours
        )
      ELSE
        lb.balance_hours + (eligible.months_to_accrue * lb.accrual_rate_per_month)
    END,
    last_accrued_on = (lb.last_accrued_on + (eligible.months_to_accrue || ' months')::INTERVAL)::DATE,
    as_of = target_date
  FROM eligible
  WHERE lb.id = eligible.id
    AND eligible.months_to_accrue > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- -----------------------------------------------------------------------------
-- Leave request audit + balance application
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_leave_request_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_by IS NULL THEN
      NEW.requested_by := auth.uid();
    END IF;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.approved_by IS NULL THEN
      NEW.approved_by := auth.uid();
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_leave_request_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance RECORD;
  v_year INTEGER;
  v_delta NUMERIC(8,2);
BEGIN
  v_year := EXTRACT(YEAR FROM NEW.start_date)::INTEGER;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      SELECT id, balance_hours, used_hours
      INTO v_balance
      FROM public.leave_balances
      WHERE employee_id = NEW.employee_id
        AND leave_type = NEW.leave_type
        AND balance_year = v_year
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance missing for employee %, type %, year %', NEW.employee_id, NEW.leave_type, v_year;
      END IF;

      IF v_balance.balance_hours < NEW.hours_requested THEN
        RAISE EXCEPTION 'Insufficient leave balance for employee %, type %', NEW.employee_id, NEW.leave_type;
      END IF;

      UPDATE public.leave_balances
      SET
        balance_hours = balance_hours - NEW.hours_requested,
        used_hours = used_hours + NEW.hours_requested,
        as_of = CURRENT_DATE
      WHERE id = v_balance.id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
      SELECT id, balance_hours, used_hours
      INTO v_balance
      FROM public.leave_balances
      WHERE employee_id = NEW.employee_id
        AND leave_type = NEW.leave_type
        AND balance_year = v_year
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance missing for employee %, type %, year %', NEW.employee_id, NEW.leave_type, v_year;
      END IF;

      IF v_balance.balance_hours < NEW.hours_requested THEN
        RAISE EXCEPTION 'Insufficient leave balance for employee %, type %', NEW.employee_id, NEW.leave_type;
      END IF;

      UPDATE public.leave_balances
      SET
        balance_hours = balance_hours - NEW.hours_requested,
        used_hours = used_hours + NEW.hours_requested,
        as_of = CURRENT_DATE
      WHERE id = v_balance.id;

    ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
      SELECT id, balance_hours, used_hours
      INTO v_balance
      FROM public.leave_balances
      WHERE employee_id = OLD.employee_id
        AND leave_type = OLD.leave_type
        AND balance_year = EXTRACT(YEAR FROM OLD.start_date)::INTEGER
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.leave_balances
        SET
          balance_hours = balance_hours + OLD.hours_requested,
          used_hours = GREATEST(0, used_hours - OLD.hours_requested),
          as_of = CURRENT_DATE
        WHERE id = v_balance.id;
      END IF;

    ELSIF OLD.status = 'approved' AND NEW.status = 'approved' AND NEW.hours_requested <> OLD.hours_requested THEN
      v_delta := NEW.hours_requested - OLD.hours_requested;

      SELECT id, balance_hours, used_hours
      INTO v_balance
      FROM public.leave_balances
      WHERE employee_id = NEW.employee_id
        AND leave_type = NEW.leave_type
        AND balance_year = v_year
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance missing for employee %, type %, year %', NEW.employee_id, NEW.leave_type, v_year;
      END IF;

      IF v_delta > 0 THEN
        IF v_balance.balance_hours < v_delta THEN
          RAISE EXCEPTION 'Insufficient leave balance for employee %, type %', NEW.employee_id, NEW.leave_type;
        END IF;
        UPDATE public.leave_balances
        SET
          balance_hours = balance_hours - v_delta,
          used_hours = used_hours + v_delta,
          as_of = CURRENT_DATE
        WHERE id = v_balance.id;
      ELSE
        UPDATE public.leave_balances
        SET
          balance_hours = balance_hours + ABS(v_delta),
          used_hours = GREATEST(0, used_hours - ABS(v_delta)),
          as_of = CURRENT_DATE
        WHERE id = v_balance.id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_leave_request_audit ON public.leave_requests;
CREATE TRIGGER set_leave_request_audit
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leave_request_audit_fields();

DROP TRIGGER IF EXISTS apply_leave_request_balance ON public.leave_requests;
CREATE TRIGGER apply_leave_request_balance
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_leave_request_balance();

DROP TRIGGER IF EXISTS init_leave_balances_on_employee ON public.employees;
CREATE TRIGGER init_leave_balances_on_employee
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_leave_balances_on_employee();

-- Initialize balances for existing employees based on policies
DO $$
DECLARE
  employee_record RECORD;
BEGIN
  FOR employee_record IN
    SELECT id FROM public.employees
  LOOP
    PERFORM public.ensure_leave_balances_for_employee(employee_record.id);
  END LOOP;
END;
$$;
-- HR documents metadata: contracts and certifications with expiry tracking

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_document_type') THEN
    CREATE TYPE public.hr_document_type AS ENUM ('contract', 'certification', 'policy', 'training', 'other');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role_name(p_user_id UUID, p_role_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role::text = p_role_name
  );
$$;

CREATE OR REPLACE FUNCTION public.can_supervisor_view_employee(p_user_id UUID, p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role_name(p_user_id, 'supervisor')
    AND EXISTS (
      SELECT 1
      FROM public.employees target
      JOIN public.employees self_emp ON self_emp.user_id = p_user_id
      WHERE target.id = p_employee_id
        AND self_emp.department IS NOT NULL
        AND target.department = self_emp.department
    );
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_document_status') THEN
    CREATE TYPE public.hr_document_status AS ENUM ('active', 'expired', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type public.hr_document_type NOT NULL DEFAULT 'other',
  issuer TEXT,
  issue_date DATE,
  expires_on DATE,
  reminder_days_before INTEGER NOT NULL DEFAULT 30,
  remind_on DATE,
  status public.hr_document_status NOT NULL DEFAULT 'active',
  file_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_documents_reminder_valid CHECK (reminder_days_before >= 0)
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON public.hr_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_expires_on ON public.hr_documents(expires_on);
CREATE INDEX IF NOT EXISTS idx_hr_documents_status ON public.hr_documents(status);

CREATE OR REPLACE FUNCTION public.set_hr_document_remind_on()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_on IS NOT NULL THEN
    NEW.remind_on := NEW.expires_on - (NEW.reminder_days_before || ' days')::INTERVAL;
  ELSE
    NEW.remind_on := NULL;
  END IF;

  IF NEW.expires_on IS NOT NULL AND NEW.expires_on < CURRENT_DATE THEN
    NEW.status := 'expired';
  ELSIF NEW.status = 'expired' AND (NEW.expires_on IS NULL OR NEW.expires_on >= CURRENT_DATE) THEN
    NEW.status := 'active';
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_hr_document_remind_on ON public.hr_documents;
CREATE TRIGGER set_hr_document_remind_on
  BEFORE INSERT OR UPDATE ON public.hr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hr_document_remind_on();

DROP TRIGGER IF EXISTS update_hr_documents_updated_at ON public.hr_documents;
CREATE TRIGGER update_hr_documents_updated_at
  BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view HR documents" ON public.hr_documents;
CREATE POLICY "Authenticated users can view HR documents"
  ON public.hr_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage HR documents" ON public.hr_documents;
CREATE POLICY "Managers and admins can manage HR documents"
  ON public.hr_documents FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
-- Unify employees and workers: move worker-facing metrics to employees and use employee_id

-- -----------------------------------------------------------------------------
-- Add performance metrics to employees (source of truth)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sheets_per_hour INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teamwork_rating INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS overtime_availability BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS attendance_score INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS lateness_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS speed_score INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS overall_rating INTEGER DEFAULT 75;

UPDATE public.employees e
SET
  sheets_per_hour = COALESCE(e.sheets_per_hour, w.sheets_per_hour, 0),
  teamwork_rating = COALESCE(e.teamwork_rating, w.teamwork_rating, 75),
  overtime_availability = COALESCE(e.overtime_availability, w.overtime_availability, true),
  attendance_score = COALESCE(e.attendance_score, w.attendance_score, 100),
  lateness_minutes = COALESCE(e.lateness_minutes, w.lateness_minutes, 0),
  quality_score = COALESCE(e.quality_score, w.quality_score, 75),
  speed_score = COALESCE(e.speed_score, w.speed_score, 75),
  overall_rating = COALESCE(e.overall_rating, w.overall_rating, 75)
FROM public.workers w
WHERE e.worker_legacy_id = w.id;

-- -----------------------------------------------------------------------------
-- Task logs: add employee_id and backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_logs
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.task_logs
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.task_logs tl
SET employee_id = e.id
FROM public.employees e
WHERE tl.employee_id IS NULL
  AND tl.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_task_logs_employee_id ON public.task_logs(employee_id);

-- -----------------------------------------------------------------------------
-- Roster workers: add employee_id and backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.roster_workers
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.roster_workers
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.roster_workers rw
SET employee_id = e.id
FROM public.employees e
WHERE rw.employee_id IS NULL
  AND rw.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_roster_workers_employee_id ON public.roster_workers(employee_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'roster_workers_employee_unique'
  ) THEN
    CREATE UNIQUE INDEX roster_workers_employee_unique
      ON public.roster_workers(roster_id, employee_id)
      WHERE employee_id IS NOT NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Worker assignments: prefer employee_id and allow worker_id to be nullable
-- -----------------------------------------------------------------------------
ALTER TABLE public.worker_assignments
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.worker_assignments
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.worker_assignments wa
SET employee_id = e.id
FROM public.employees e
WHERE wa.employee_id IS NULL
  AND wa.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_worker_assignments_employee_id
  ON public.worker_assignments(employee_id);

-- -----------------------------------------------------------------------------
-- Worker stats view: switch to employees as source of truth
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.worker_stats AS
SELECT
  e.id,
  e.full_name AS name,
  e.department,
  COUNT(tl.id) AS total_tasks,
  AVG(tl.time_spent_minutes) AS avg_time_minutes,
  AVG(tl.performance_rating) AS avg_rating,
  GREATEST(0, 100 - (AVG(tl.time_spent_minutes) * 0.5))::INTEGER AS efficiency_score,
  e.sheets_per_hour,
  e.teamwork_rating,
  e.overtime_availability,
  e.attendance_score,
  e.lateness_minutes,
  e.quality_score,
  e.speed_score,
  e.overall_rating
FROM public.employees e
LEFT JOIN public.task_logs tl ON e.id = tl.employee_id
GROUP BY
  e.id,
  e.full_name,
  e.department,
  e.sheets_per_hour,
  e.teamwork_rating,
  e.overtime_availability,
  e.attendance_score,
  e.lateness_minutes,
  e.quality_score,
  e.speed_score,
  e.overall_rating;

GRANT SELECT ON public.worker_stats TO authenticated;

-- -----------------------------------------------------------------------------
-- Jobs: add assigned_employee_id when legacy worker assignment exists
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
  ) THEN
    ALTER TABLE public.jobs
      ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name = 'assigned_worker_id'
    ) THEN
      UPDATE public.jobs j
      SET assigned_employee_id = e.id
      FROM public.employees e
      WHERE j.assigned_employee_id IS NULL
        AND j.assigned_worker_id = e.worker_legacy_id;
    END IF;
  END IF;
END $$;
-- Configurable cost model settings for scheduling decisions

CREATE TABLE IF NOT EXISTS public.scheduling_cost_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  cost_weight NUMERIC(6,2) NOT NULL DEFAULT 1,
  rating_weight NUMERIC(6,2) NOT NULL DEFAULT 0,
  skill_weight NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_multiplier_50 NUMERIC(6,2),
  overtime_multiplier_100 NUMERIC(6,2),
  night_shift_multiplier NUMERIC(6,2),
  weekend_multiplier NUMERIC(6,2),
  minimum_hourly_rate NUMERIC(12,2),
  maximum_hourly_rate NUMERIC(12,2),
  rounding_increment NUMERIC(6,2) NOT NULL DEFAULT 0.01,
  prefer_lower_cost BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_cost_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view cost models" ON public.scheduling_cost_models;
CREATE POLICY "Authenticated users can view cost models"
  ON public.scheduling_cost_models FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage cost models" ON public.scheduling_cost_models;
CREATE POLICY "Admins can manage cost models"
  ON public.scheduling_cost_models FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS scheduling_cost_models_active_unique
  ON public.scheduling_cost_models ((is_active))
  WHERE is_active = true;

DROP TRIGGER IF EXISTS update_scheduling_cost_models_updated_at ON public.scheduling_cost_models;
CREATE TRIGGER update_scheduling_cost_models_updated_at
  BEFORE UPDATE ON public.scheduling_cost_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scheduling_cost_models (name)
SELECT 'Default Cost Model'
WHERE NOT EXISTS (
  SELECT 1 FROM public.scheduling_cost_models WHERE is_active = true
);
-- Legal compliance checks for scheduling assignments
-- Enforces max hours, rest periods, and overtime caps by contract.

CREATE OR REPLACE FUNCTION public.validate_worker_assignment_compliance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_contract public.employment_contracts;
  v_shift public.shifts;
  v_shift_start TIMESTAMPTZ;
  v_shift_end TIMESTAMPTZ;
  v_shift_hours NUMERIC;
  v_daily_hours NUMERIC;
  v_weekly_hours NUMERIC;
  v_week_start DATE;
  v_week_end DATE;
  v_overtime_hours NUMERIC;
  v_prev_end TIMESTAMPTZ;
  v_next_start TIMESTAMPTZ;
  v_rest_hours NUMERIC;
BEGIN
  v_employee_id := NEW.employee_id;

  IF v_employee_id IS NULL AND NEW.worker_id IS NOT NULL THEN
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE worker_legacy_id = NEW.worker_id
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Assignment requires a valid employee_id.';
  END IF;

  SELECT * INTO v_contract
  FROM public.get_contract_at_date(v_employee_id, NEW.date);

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'No active employment contract for employee % on %.', v_employee_id, NEW.date;
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = NEW.shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift % not found.', NEW.shift_id;
  END IF;

  v_shift_start := (NEW.date + v_shift.start_time);
  v_shift_end := (NEW.date + v_shift.end_time);
  IF v_shift_end <= v_shift_start THEN
    v_shift_end := v_shift_end + INTERVAL '1 day';
  END IF;

  v_shift_hours := EXTRACT(EPOCH FROM (v_shift_end - v_shift_start)) / 3600.0;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      (CASE
        WHEN (a.date + s.end_time) <= (a.date + s.start_time)
          THEN (a.date + s.end_time) + INTERVAL '1 day'
        ELSE (a.date + s.end_time)
      END) - (a.date + s.start_time)
    )) / 3600.0
  ), 0)
  INTO v_daily_hours
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE (a.employee_id = v_employee_id OR a.worker_id = NEW.worker_id)
    AND a.date = NEW.date
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  v_daily_hours := v_daily_hours + v_shift_hours;
  IF v_daily_hours > v_contract.max_hours_per_day THEN
    RAISE EXCEPTION 'Daily hours exceed contract maximum (%.2f > %.2f).',
      v_daily_hours, v_contract.max_hours_per_day;
  END IF;

  v_week_start := date_trunc('week', NEW.date)::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      (CASE
        WHEN (a.date + s.end_time) <= (a.date + s.start_time)
          THEN (a.date + s.end_time) + INTERVAL '1 day'
        ELSE (a.date + s.end_time)
      END) - (a.date + s.start_time)
    )) / 3600.0
  ), 0)
  INTO v_weekly_hours
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE (a.employee_id = v_employee_id OR a.worker_id = NEW.worker_id)
    AND a.date BETWEEN v_week_start AND v_week_end
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  v_weekly_hours := v_weekly_hours + v_shift_hours;
  IF v_weekly_hours > v_contract.max_hours_per_week THEN
    RAISE EXCEPTION 'Weekly hours exceed contract maximum (%.2f > %.2f).',
      v_weekly_hours, v_contract.max_hours_per_week;
  END IF;

  v_overtime_hours := GREATEST(0, v_weekly_hours - v_contract.base_hours_per_week);
  IF NOT v_contract.overtime_allowed AND v_overtime_hours > 0 THEN
    RAISE EXCEPTION 'Overtime is not allowed for this contract.';
  END IF;

  IF v_overtime_hours > v_contract.overtime_cap_hours_per_week THEN
    RAISE EXCEPTION 'Overtime cap exceeded (%.2f > %.2f).',
      v_overtime_hours, v_contract.overtime_cap_hours_per_week;
  END IF;

  SELECT MAX(
    CASE
      WHEN (a.date + s.end_time) <= (a.date + s.start_time)
        THEN (a.date + s.end_time) + INTERVAL '1 day'
      ELSE (a.date + s.end_time)
    END
  )
  INTO v_prev_end
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE (a.employee_id = v_employee_id OR a.worker_id = NEW.worker_id)
    AND (a.date < NEW.date OR (a.date = NEW.date AND s.start_time < v_shift.start_time))
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  IF v_prev_end IS NOT NULL THEN
    v_rest_hours := EXTRACT(EPOCH FROM (v_shift_start - v_prev_end)) / 3600.0;
    IF v_rest_hours < v_contract.minimum_rest_hours THEN
      RAISE EXCEPTION 'Minimum rest period not met (%.2f < %.2f).',
        v_rest_hours, v_contract.minimum_rest_hours;
    END IF;
  END IF;

  SELECT MIN(a.date + s.start_time)
  INTO v_next_start
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE (a.employee_id = v_employee_id OR a.worker_id = NEW.worker_id)
    AND (a.date > NEW.date OR (a.date = NEW.date AND s.start_time > v_shift.start_time))
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  IF v_next_start IS NOT NULL THEN
    v_rest_hours := EXTRACT(EPOCH FROM (v_next_start - v_shift_end)) / 3600.0;
    IF v_rest_hours < v_contract.minimum_rest_hours THEN
      RAISE EXCEPTION 'Minimum rest period not met (%.2f < %.2f).',
        v_rest_hours, v_contract.minimum_rest_hours;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'validate_worker_assignment_compliance'
  ) THEN
    CREATE TRIGGER validate_worker_assignment_compliance
      BEFORE INSERT OR UPDATE ON public.worker_assignments
      FOR EACH ROW
      EXECUTE FUNCTION public.validate_worker_assignment_compliance();
  END IF;
END $$;
-- Monthly payroll calculator based on assignments + compensation + OT multipliers + incentives

CREATE OR REPLACE FUNCTION public.calculate_monthly_payroll(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  regular_hours NUMERIC,
  overtime_hours NUMERIC,
  base_pay NUMERIC,
  overtime_pay NUMERIC,
  night_differential NUMERIC,
  weekend_differential NUMERIC,
  incentives NUMERIC,
  gross_pay NUMERIC,
  currency_code TEXT,
  assignments_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid month: %. Expected 1-12.', p_month;
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month - 1 day')::DATE;

  RETURN QUERY
  WITH assignment_hours AS (
    SELECT
      COALESCE(wa.employee_id, e.id) AS employee_id,
      wa.date,
      CASE WHEN wa.role ILIKE '%overtime%' THEN true ELSE false END AS is_overtime,
      (
        EXTRACT(EPOCH FROM (
          (
            wa.date + s.end_time
            + CASE WHEN s.end_time <= s.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
          ) - (wa.date + s.start_time)
        )) / 3600.0
      )::NUMERIC AS hours,
      CASE WHEN EXTRACT(DOW FROM wa.date) IN (0, 6) THEN true ELSE false END AS is_weekend,
      CASE
        WHEN s.start_time >= TIME '20:00'
          OR s.start_time < TIME '06:00'
          OR s.end_time >= TIME '20:00'
          OR s.end_time < TIME '06:00'
        THEN true
        ELSE false
      END AS is_night
    FROM public.worker_assignments wa
    INNER JOIN public.shifts s ON s.id = wa.shift_id
    LEFT JOIN public.employees e ON e.worker_legacy_id = wa.worker_id
    WHERE wa.date BETWEEN v_start_date AND v_end_date
      AND COALESCE(wa.employee_id, e.id) IS NOT NULL
      AND (p_employee_id IS NULL OR COALESCE(wa.employee_id, e.id) = p_employee_id)
  ),
  assignment_pay AS (
    SELECT
      ah.employee_id,
      ah.hours,
      ah.is_overtime,
      p.base_pay,
      p.overtime_50_pay,
      p.overtime_100_pay,
      p.night_differential,
      p.weekend_differential,
      p.total_pay,
      p.currency_code
    FROM assignment_hours ah
    CROSS JOIN LATERAL public.calculate_payroll_for_assignment(
      ah.employee_id,
      ah.date,
      CASE WHEN ah.is_overtime THEN 0 ELSE ah.hours END,
      CASE WHEN ah.is_overtime THEN ah.hours ELSE 0 END,
      0,
      CASE WHEN ah.is_night THEN ah.hours ELSE 0 END,
      CASE WHEN ah.is_weekend THEN ah.hours ELSE 0 END
    ) p
  ),
  payroll_agg AS (
    SELECT
      employee_id,
      COALESCE(SUM(CASE WHEN is_overtime THEN 0 ELSE hours END), 0)::NUMERIC AS regular_hours,
      COALESCE(SUM(CASE WHEN is_overtime THEN hours ELSE 0 END), 0)::NUMERIC AS overtime_hours,
      COALESCE(SUM(base_pay), 0)::NUMERIC AS base_pay,
      COALESCE(SUM(overtime_50_pay + overtime_100_pay), 0)::NUMERIC AS overtime_pay,
      COALESCE(SUM(night_differential), 0)::NUMERIC AS night_differential,
      COALESCE(SUM(weekend_differential), 0)::NUMERIC AS weekend_differential,
      COALESCE(SUM(total_pay), 0)::NUMERIC AS assignment_pay,
      MAX(currency_code) AS currency_code,
      COUNT(*)::INTEGER AS assignments_count
    FROM assignment_pay
    GROUP BY employee_id
  ),
  incentive_agg AS (
    SELECT
      ei.employee_id,
      COALESCE(SUM(ei.amount), 0)::NUMERIC AS incentives,
      MAX(ei.currency_code) AS currency_code
    FROM public.employee_incentives ei
    WHERE ei.awarded_date BETWEEN v_start_date AND v_end_date
      AND ei.status IN ('approved', 'paid')
      AND (p_employee_id IS NULL OR ei.employee_id = p_employee_id)
    GROUP BY ei.employee_id
  ),
  combined AS (
    SELECT
      COALESCE(pa.employee_id, ia.employee_id) AS employee_id,
      COALESCE(pa.regular_hours, 0)::NUMERIC AS regular_hours,
      COALESCE(pa.overtime_hours, 0)::NUMERIC AS overtime_hours,
      COALESCE(pa.base_pay, 0)::NUMERIC AS base_pay,
      COALESCE(pa.overtime_pay, 0)::NUMERIC AS overtime_pay,
      COALESCE(pa.night_differential, 0)::NUMERIC AS night_differential,
      COALESCE(pa.weekend_differential, 0)::NUMERIC AS weekend_differential,
      COALESCE(ia.incentives, 0)::NUMERIC AS incentives,
      (COALESCE(pa.assignment_pay, 0) + COALESCE(ia.incentives, 0))::NUMERIC AS gross_pay,
      COALESCE(pa.currency_code, ia.currency_code, 'USD')::TEXT AS currency_code,
      COALESCE(pa.assignments_count, 0)::INTEGER AS assignments_count
    FROM payroll_agg pa
    FULL OUTER JOIN incentive_agg ia ON ia.employee_id = pa.employee_id
  )
  SELECT
    c.employee_id,
    e.full_name AS employee_name,
    c.regular_hours,
    c.overtime_hours,
    c.base_pay,
    c.overtime_pay,
    c.night_differential,
    c.weekend_differential,
    c.incentives,
    c.gross_pay,
    c.currency_code,
    c.assignments_count
  FROM combined c
  INNER JOIN public.employees e ON e.id = c.employee_id
  ORDER BY e.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_monthly_payroll(INTEGER, INTEGER, UUID) TO authenticated;
-- Ensure financial analysis tables exist (for environments that skipped older migrations)

CREATE TABLE IF NOT EXISTS public.ot_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  material_cost DECIMAL(10,2) DEFAULT 0,
  labor_cost DECIMAL(10,2) DEFAULT 0,
  machine_cost DECIMAL(10,2) DEFAULT 0,
  overhead_cost DECIMAL(10,2) DEFAULT 0,
  total_cost DECIMAL(10,2) GENERATED ALWAYS AS (material_cost + labor_cost + machine_cost + overhead_cost) STORED,
  revenue DECIMAL(10,2) DEFAULT 0,
  profit DECIMAL(10,2) GENERATED ALWAYS AS (revenue - (material_cost + labor_cost + machine_cost + overhead_cost)) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(ot_id)
);

CREATE TABLE IF NOT EXISTS public.machine_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  energy_cost DECIMAL(10,2) DEFAULT 0,
  labor_cost DECIMAL(10,2) DEFAULT 0,
  maintenance_cost DECIMAL(10,2) DEFAULT 0,
  spare_parts_cost DECIMAL(10,2) DEFAULT 0,
  total_operating_cost DECIMAL(10,2) GENERATED ALWAYS AS (energy_cost + labor_cost + maintenance_cost + spare_parts_cost) STORED,
  outsourcing_cost DECIMAL(10,2) DEFAULT 0,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(machine_id, month)
);

CREATE TABLE IF NOT EXISTS public.equipment_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  equipment_name TEXT NOT NULL,
  purchase_cost DECIMAL(12,2) NOT NULL,
  estimated_annual_savings DECIMAL(10,2) DEFAULT 0,
  estimated_roi_months INTEGER,
  payback_period_months INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN estimated_annual_savings > 0
      THEN CEIL((purchase_cost / (estimated_annual_savings / 12))::numeric)
      ELSE NULL
    END
  ) STORED,
  status TEXT DEFAULT 'proposal' CHECK (status IN ('proposal', 'approved', 'rejected', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ot_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers and admins can view OT financials" ON public.ot_financials;
CREATE POLICY "Managers and admins can view OT financials"
ON public.ot_financials
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can manage OT financials" ON public.ot_financials;
CREATE POLICY "Managers and admins can manage OT financials"
ON public.ot_financials
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can view machine costs" ON public.machine_costs;
CREATE POLICY "Managers and admins can view machine costs"
ON public.machine_costs
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can manage machine costs" ON public.machine_costs;
CREATE POLICY "Managers and admins can manage machine costs"
ON public.machine_costs
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can view equipment investments" ON public.equipment_investments;
CREATE POLICY "Managers and admins can view equipment investments"
ON public.equipment_investments
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can manage equipment investments" ON public.equipment_investments;
CREATE POLICY "Managers and admins can manage equipment investments"
ON public.equipment_investments
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_ot_financials_updated_at ON public.ot_financials;
CREATE TRIGGER update_ot_financials_updated_at
BEFORE UPDATE ON public.ot_financials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_machine_costs_updated_at ON public.machine_costs;
CREATE TRIGGER update_machine_costs_updated_at
BEFORE UPDATE ON public.machine_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_equipment_investments_updated_at ON public.equipment_investments;
CREATE TRIGGER update_equipment_investments_updated_at
BEFORE UPDATE ON public.equipment_investments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- Migration 8: Employee Cost Timeline
-- ================================================================
-- Migration: Employee Cost Timeline
-- Description: Time-series view of per-employee labor costs with base hours, OT, premiums, and incentives
-- Created: 2026-02-23

-- Function to calculate employee cost timeline over a date range
CREATE OR REPLACE FUNCTION get_employee_cost_timeline(
  p_employee_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_granularity TEXT DEFAULT 'month' -- 'week' or 'month'
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  employee_id UUID,
  employee_name TEXT,
  base_hours NUMERIC,
  ot50_hours NUMERIC,
  ot100_hours NUMERIC,
  night_hours NUMERIC,
  weekend_hours NUMERIC,
  base_pay NUMERIC,
  ot50_pay NUMERIC,
  ot100_pay NUMERIC,
  night_differential NUMERIC,
  weekend_differential NUMERIC,
  overtime_premium NUMERIC,
  incentive_pay NUMERIC,
  total_labor_cost NUMERIC
) AS $$
DECLARE
  v_interval INTERVAL;
  v_date_trunc TEXT;
BEGIN
  -- Determine date truncation based on granularity
  IF p_granularity = 'week' THEN
    v_date_trunc := 'week';
    v_interval := '1 week'::INTERVAL;
  ELSE
    v_date_trunc := 'month';
    v_interval := '1 month'::INTERVAL;
  END IF;

  RETURN QUERY
  WITH period_series AS (
    -- Generate time periods
    SELECT 
      date_trunc(v_date_trunc, d)::DATE as period_start,
      (date_trunc(v_date_trunc, d) + v_interval - '1 day'::INTERVAL)::DATE as period_end
    FROM generate_series(
      date_trunc(v_date_trunc, p_start_date),
      p_end_date,
      v_interval
    ) d
  ),
  assignment_costs AS (
    -- Calculate assignment-level costs
    SELECT
      ps.period_start,
      ps.period_end,
      wa.employee_id,
      COALESCE(SUM(wa.hours_worked), 0) as total_hours,
      COALESCE(SUM(CASE WHEN wa.hours_worked <= ec.regular_hours_limit THEN wa.hours_worked ELSE ec.regular_hours_limit END), 0) as base_hours,
      COALESCE(SUM(CASE WHEN wa.hours_worked > ec.regular_hours_limit AND wa.hours_worked <= ec.regular_hours_limit + ec.ot50_hours_limit THEN wa.hours_worked - ec.regular_hours_limit ELSE 0 END), 0) as ot50_hours,
      COALESCE(SUM(CASE WHEN wa.hours_worked > ec.regular_hours_limit + ec.ot50_hours_limit THEN wa.hours_worked - ec.regular_hours_limit - ec.ot50_hours_limit ELSE 0 END), 0) as ot100_hours,
      COALESCE(SUM(CASE WHEN s.is_night_shift THEN wa.hours_worked ELSE 0 END), 0) as night_hours,
      COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM wa.assignment_date) IN (0, 6) THEN wa.hours_worked ELSE 0 END), 0) as weekend_hours,
      COALESCE(SUM(
        CASE WHEN wa.hours_worked <= ec.regular_hours_limit 
        THEN wa.hours_worked * cr.hourly_rate
        ELSE ec.regular_hours_limit * cr.hourly_rate
        END
      ), 0) as base_pay,
      COALESCE(SUM(
        CASE WHEN wa.hours_worked > ec.regular_hours_limit AND wa.hours_worked <= ec.regular_hours_limit + ec.ot50_hours_limit
        THEN (wa.hours_worked - ec.regular_hours_limit) * cr.hourly_rate * 1.5
        ELSE 0 END
      ), 0) as ot50_pay,
      COALESCE(SUM(
        CASE WHEN wa.hours_worked > ec.regular_hours_limit + ec.ot50_hours_limit
        THEN (wa.hours_worked - ec.regular_hours_limit - ec.ot50_hours_limit) * cr.hourly_rate * 2.0
        ELSE 0 END
      ), 0) as ot100_pay,
      COALESCE(SUM(
        CASE WHEN s.is_night_shift 
        THEN wa.hours_worked * cr.hourly_rate * 0.15
        ELSE 0 END
      ), 0) as night_differential,
      COALESCE(SUM(
        CASE WHEN EXTRACT(DOW FROM wa.assignment_date) IN (0, 6)
        THEN wa.hours_worked * cr.hourly_rate * 0.20
        ELSE 0 END
      ), 0) as weekend_differential
    FROM period_series ps
    CROSS JOIN LATERAL (
      SELECT * FROM employees e WHERE e.id = p_employee_id
    ) e
    LEFT JOIN worker_assignments wa ON wa.employee_id = e.id
      AND wa.assignment_date BETWEEN ps.period_start AND ps.period_end
    LEFT JOIN employment_contracts ec ON ec.employee_id = wa.employee_id
      AND ec.contract_start_date <= wa.assignment_date
      AND (ec.contract_end_date IS NULL OR ec.contract_end_date >= wa.assignment_date)
    LEFT JOIN shifts s ON s.id = wa.shift_id
    LEFT JOIN compensation_rates cr ON cr.employee_id = wa.employee_id
      AND cr.effective_date <= wa.assignment_date
      AND (cr.end_date IS NULL OR cr.end_date >= wa.assignment_date)
    GROUP BY ps.period_start, ps.period_end, wa.employee_id
  ),
  incentive_costs AS (
    -- Calculate incentives per period
    SELECT
      ps.period_start,
      ps.period_end,
      ei.employee_id,
      COALESCE(SUM(ei.amount), 0) as total_incentives
    FROM period_series ps
    CROSS JOIN employee_incentives ei
    WHERE ei.employee_id = p_employee_id
      AND ei.payment_date BETWEEN ps.period_start AND ps.period_end
    GROUP BY ps.period_start, ps.period_end, ei.employee_id
  )
  SELECT
    ps.period_start,
    ps.period_end,
    e.id as employee_id,
    e.name as employee_name,
    COALESCE(ac.base_hours, 0)::NUMERIC as base_hours,
    COALESCE(ac.ot50_hours, 0)::NUMERIC as ot50_hours,
    COALESCE(ac.ot100_hours, 0)::NUMERIC as ot100_hours,
    COALESCE(ac.night_hours, 0)::NUMERIC as night_hours,
    COALESCE(ac.weekend_hours, 0)::NUMERIC as weekend_hours,
    COALESCE(ac.base_pay, 0)::NUMERIC as base_pay,
    COALESCE(ac.ot50_pay, 0)::NUMERIC as ot50_pay,
    COALESCE(ac.ot100_pay, 0)::NUMERIC as ot100_pay,
    COALESCE(ac.night_differential, 0)::NUMERIC as night_differential,
    COALESCE(ac.weekend_differential, 0)::NUMERIC as weekend_differential,
    (COALESCE(ac.ot50_pay, 0) + COALESCE(ac.ot100_pay, 0))::NUMERIC as overtime_premium,
    COALESCE(ic.total_incentives, 0)::NUMERIC as incentive_pay,
    (
      COALESCE(ac.base_pay, 0) +
      COALESCE(ac.ot50_pay, 0) +
      COALESCE(ac.ot100_pay, 0) +
      COALESCE(ac.night_differential, 0) +
      COALESCE(ac.weekend_differential, 0) +
      COALESCE(ic.total_incentives, 0)
    )::NUMERIC as total_labor_cost
  FROM period_series ps
  CROSS JOIN employees e
  LEFT JOIN assignment_costs ac ON ac.period_start = ps.period_start 
    AND ac.period_end = ps.period_end 
    AND ac.employee_id = e.id
  LEFT JOIN incentive_costs ic ON ic.period_start = ps.period_start 
    AND ic.period_end = ps.period_end 
    AND ic.employee_id = e.id
  WHERE e.id = p_employee_id
  ORDER BY ps.period_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_employee_cost_timeline TO authenticated;

-- Comment
COMMENT ON FUNCTION get_employee_cost_timeline IS 
'Returns time-series cost breakdown for a single employee including base hours, OT hours (50% and 100%), premiums, incentives, and total labor cost. Supports weekly or monthly granularity.';

-- ================================================================
-- Migration 9: Order Labor Margin Analysis
-- ================================================================
-- Migration: Order Labor Margin Analysis
-- Description: Calculate profitability per OT/order by comparing revenue vs labor cost vs incentive cost
-- Created: 2026-02-24

-- Function to calculate order-level labor margin
CREATE OR REPLACE FUNCTION get_order_labor_margin(
  p_ot_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  ot_id UUID,
  ot_number TEXT,
  client_name TEXT,
  order_date DATE,
  completion_date DATE,
  revenue NUMERIC,
  base_labor_cost NUMERIC,
  overtime_premium NUMERIC,
  night_differential NUMERIC,
  weekend_differential NUMERIC,
  total_labor_cost NUMERIC,
  incentive_cost NUMERIC,
  total_cost NUMERIC,
  gross_margin NUMERIC,
  margin_percentage NUMERIC,
  labor_hours NUMERIC,
  overtime_hours NUMERIC,
  cost_per_hour NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH ot_assignments AS (
    -- Get all assignments linked to OTs
    SELECT
      wa.ot_id,
      wa.employee_id,
      wa.assignment_date,
      wa.hours_worked,
      wa.shift_id,
      s.is_night_shift,
      EXTRACT(DOW FROM wa.assignment_date) as day_of_week,
      ec.regular_hours_limit,
      ec.ot50_hours_limit,
      cr.hourly_rate
    FROM worker_assignments wa
    LEFT JOIN shifts s ON s.id = wa.shift_id
    LEFT JOIN employment_contracts ec ON ec.employee_id = wa.employee_id
      AND ec.contract_start_date <= wa.assignment_date
      AND (ec.contract_end_date IS NULL OR ec.contract_end_date >= wa.assignment_date)
    LEFT JOIN compensation_rates cr ON cr.employee_id = wa.employee_id
      AND cr.effective_date <= wa.assignment_date
      AND (cr.end_date IS NULL OR cr.end_date >= wa.assignment_date)
    WHERE wa.ot_id IS NOT NULL
      AND (p_ot_id IS NULL OR wa.ot_id = p_ot_id)
      AND (p_start_date IS NULL OR wa.assignment_date >= p_start_date)
      AND (p_end_date IS NULL OR wa.assignment_date <= p_end_date)
  ),
  labor_costs AS (
    -- Calculate detailed labor costs per OT
    SELECT
      ot_id,
      SUM(hours_worked) as total_hours,
      SUM(
        CASE 
          WHEN hours_worked <= COALESCE(regular_hours_limit, 8) 
          THEN hours_worked 
          ELSE COALESCE(regular_hours_limit, 8)
        END
      ) as regular_hours,
      SUM(
        CASE 
          WHEN hours_worked > COALESCE(regular_hours_limit, 8) 
          THEN hours_worked - COALESCE(regular_hours_limit, 8)
          ELSE 0
        END
      ) as ot_hours,
      -- Base labor cost (regular hours at base rate)
      SUM(
        CASE 
          WHEN hours_worked <= COALESCE(regular_hours_limit, 8) 
          THEN hours_worked * COALESCE(hourly_rate, 0)
          ELSE COALESCE(regular_hours_limit, 8) * COALESCE(hourly_rate, 0)
        END
      ) as base_cost,
      -- OT50 premium (1.5x - 1.0x = 0.5x extra)
      SUM(
        CASE 
          WHEN hours_worked > COALESCE(regular_hours_limit, 8) 
            AND hours_worked <= COALESCE(regular_hours_limit, 8) + COALESCE(ot50_hours_limit, 2)
          THEN (hours_worked - COALESCE(regular_hours_limit, 8)) * COALESCE(hourly_rate, 0) * 1.5
          WHEN hours_worked > COALESCE(regular_hours_limit, 8) + COALESCE(ot50_hours_limit, 2)
          THEN COALESCE(ot50_hours_limit, 2) * COALESCE(hourly_rate, 0) * 1.5
          ELSE 0
        END
      ) as ot50_cost,
      -- OT100 premium (2.0x)
      SUM(
        CASE 
          WHEN hours_worked > COALESCE(regular_hours_limit, 8) + COALESCE(ot50_hours_limit, 2)
          THEN (hours_worked - COALESCE(regular_hours_limit, 8) - COALESCE(ot50_hours_limit, 2)) * COALESCE(hourly_rate, 0) * 2.0
          ELSE 0
        END
      ) as ot100_cost,
      -- Night differential (15% of hours)
      SUM(
        CASE 
          WHEN is_night_shift = true
          THEN hours_worked * COALESCE(hourly_rate, 0) * 0.15
          ELSE 0
        END
      ) as night_diff,
      -- Weekend differential (20% of hours)
      SUM(
        CASE 
          WHEN day_of_week IN (0, 6)
          THEN hours_worked * COALESCE(hourly_rate, 0) * 0.20
          ELSE 0
        END
      ) as weekend_diff
    FROM ot_assignments
    GROUP BY ot_id
  ),
  ot_incentives AS (
    -- Sum incentives associated with each OT
    SELECT
      wa.ot_id,
      COALESCE(SUM(ei.amount), 0) as total_incentives
    FROM worker_assignments wa
    LEFT JOIN employee_incentives ei ON ei.employee_id = wa.employee_id
      AND ei.payment_date = wa.assignment_date
    WHERE wa.ot_id IS NOT NULL
      AND (p_ot_id IS NULL OR wa.ot_id = p_ot_id)
      AND (p_start_date IS NULL OR wa.assignment_date >= p_start_date)
      AND (p_end_date IS NULL OR wa.assignment_date <= p_end_date)
    GROUP BY wa.ot_id
  )
  SELECT
    o.id as ot_id,
    o.ot_number,
    o.client_name,
    o.order_date,
    o.completion_date,
    COALESCE(o.revenue, 0)::NUMERIC as revenue,
    COALESCE(lc.base_cost, 0)::NUMERIC as base_labor_cost,
    (COALESCE(lc.ot50_cost, 0) + COALESCE(lc.ot100_cost, 0))::NUMERIC as overtime_premium,
    COALESCE(lc.night_diff, 0)::NUMERIC as night_differential,
    COALESCE(lc.weekend_diff, 0)::NUMERIC as weekend_differential,
    (
      COALESCE(lc.base_cost, 0) + 
      COALESCE(lc.ot50_cost, 0) + 
      COALESCE(lc.ot100_cost, 0) + 
      COALESCE(lc.night_diff, 0) + 
      COALESCE(lc.weekend_diff, 0)
    )::NUMERIC as total_labor_cost,
    COALESCE(oi.total_incentives, 0)::NUMERIC as incentive_cost,
    (
      COALESCE(lc.base_cost, 0) + 
      COALESCE(lc.ot50_cost, 0) + 
      COALESCE(lc.ot100_cost, 0) + 
      COALESCE(lc.night_diff, 0) + 
      COALESCE(lc.weekend_diff, 0) +
      COALESCE(oi.total_incentives, 0)
    )::NUMERIC as total_cost,
    (
      COALESCE(o.revenue, 0) - 
      COALESCE(lc.base_cost, 0) - 
      COALESCE(lc.ot50_cost, 0) - 
      COALESCE(lc.ot100_cost, 0) - 
      COALESCE(lc.night_diff, 0) - 
      COALESCE(lc.weekend_diff, 0) -
      COALESCE(oi.total_incentives, 0)
    )::NUMERIC as gross_margin,
    CASE 
      WHEN COALESCE(o.revenue, 0) > 0 
      THEN (
        (COALESCE(o.revenue, 0) - 
         COALESCE(lc.base_cost, 0) - 
         COALESCE(lc.ot50_cost, 0) - 
         COALESCE(lc.ot100_cost, 0) - 
         COALESCE(lc.night_diff, 0) - 
         COALESCE(lc.weekend_diff, 0) -
         COALESCE(oi.total_incentives, 0)) / o.revenue * 100
      )
      ELSE 0
    END::NUMERIC as margin_percentage,
    COALESCE(lc.total_hours, 0)::NUMERIC as labor_hours,
    COALESCE(lc.ot_hours, 0)::NUMERIC as overtime_hours,
    CASE 
      WHEN COALESCE(lc.total_hours, 0) > 0 
      THEN (
        COALESCE(lc.base_cost, 0) + 
        COALESCE(lc.ot50_cost, 0) + 
        COALESCE(lc.ot100_cost, 0) + 
        COALESCE(lc.night_diff, 0) + 
        COALESCE(lc.weekend_diff, 0)
      ) / lc.total_hours
      ELSE 0
    END::NUMERIC as cost_per_hour
  FROM ots o
  LEFT JOIN labor_costs lc ON lc.ot_id = o.id
  LEFT JOIN ot_incentives oi ON oi.ot_id = o.id
  WHERE (p_ot_id IS NULL OR o.id = p_ot_id)
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.completion_date <= p_end_date OR (o.completion_date IS NULL AND o.order_date <= p_end_date))
  ORDER BY o.order_date DESC, o.ot_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_order_labor_margin TO authenticated;

-- Comment
COMMENT ON FUNCTION get_order_labor_margin IS 
'Returns profitability analysis per OT/order showing revenue, labor costs (base + OT + differentials), incentive costs, and gross margin. Supports filtering by OT ID or date range.';

-- ================================================================
-- Migration 10: HR Role-Based Permissions
-- ================================================================
-- Role-based permissions for HR data
-- Admin + HR Manager full access, Supervisor restricted view by department

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'hr_manager'
      AND enumtypid = 'app_role'::regtype
  ) THEN
    ALTER TYPE app_role ADD VALUE 'hr_manager';
  END IF;
END $$;

-- Employment contracts
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.employment_contracts;
DROP POLICY IF EXISTS "Managers and admins can manage contracts" ON public.employment_contracts;

CREATE POLICY "Admins and HR managers can manage contracts"
  ON public.employment_contracts FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view contracts in their department"
  ON public.employment_contracts FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.employment_contracts.employee_id)
  );

-- Compensation rates
DROP POLICY IF EXISTS "Authenticated users can view compensation rates" ON public.compensation_rates;
DROP POLICY IF EXISTS "Managers and admins can manage compensation rates" ON public.compensation_rates;

CREATE POLICY "Admins and HR managers can manage compensation rates"
  ON public.compensation_rates FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view compensation rates in their department"
  ON public.compensation_rates FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.compensation_rates.employee_id)
  );

-- Leave balances
DROP POLICY IF EXISTS "Authenticated users can view leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Managers supervisors and admins can manage leave balances" ON public.leave_balances;

CREATE POLICY "Admins and HR managers can manage leave balances"
  ON public.leave_balances FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view leave balances in their department"
  ON public.leave_balances FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.leave_balances.employee_id)
  );

-- Leave requests
DROP POLICY IF EXISTS "Authenticated users can view leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Authenticated users can create leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Managers supervisors and admins can update leave requests" ON public.leave_requests;

CREATE POLICY "Admins and HR managers can manage leave requests"
  ON public.leave_requests FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view leave requests in their department"
  ON public.leave_requests FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.leave_requests.employee_id)
  );

-- Incentive rules
DROP POLICY IF EXISTS "Authenticated users can view incentive rules" ON public.incentive_rules;
DROP POLICY IF EXISTS "Managers and admins can manage incentive rules" ON public.incentive_rules;

CREATE POLICY "Admins and HR managers can manage incentive rules"
  ON public.incentive_rules FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view incentive rules"
  ON public.incentive_rules FOR SELECT
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Employee incentives
DROP POLICY IF EXISTS "Authenticated users can view employee incentives" ON public.employee_incentives;
DROP POLICY IF EXISTS "Managers and admins can manage employee incentives" ON public.employee_incentives;

CREATE POLICY "Admins and HR managers can manage employee incentives"
  ON public.employee_incentives FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view employee incentives in their department"
  ON public.employee_incentives FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.employee_incentives.employee_id)
  );

-- HR documents
DROP POLICY IF EXISTS "Authenticated users can view HR documents" ON public.hr_documents;
DROP POLICY IF EXISTS "Managers and admins can manage HR documents" ON public.hr_documents;

CREATE POLICY "Admins and HR managers can manage HR documents"
  ON public.hr_documents FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view HR documents in their department"
  ON public.hr_documents FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.hr_documents.employee_id)
  );

-- Leave policies (HR management table)
DROP POLICY IF EXISTS "Managers and admins can manage leave policies" ON public.leave_policies;

CREATE POLICY "Admins and HR managers can manage leave policies"
  ON public.leave_policies FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Authenticated users can view leave policies" ON public.leave_policies;
CREATE POLICY "Supervisors HR managers and admins can view leave policies"
  ON public.leave_policies FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ================================================================
-- Migration 11: HR Sensitive Audit Trail
-- ================================================================
-- HR sensitive changes audit trail
-- Scope: salary, contracts, leave approvals, incentive edits

CREATE TABLE IF NOT EXISTS public.hr_sensitive_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'APPROVAL_UPDATE')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  old_data JSONB,
  new_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_table_name ON public.hr_sensitive_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_employee_id ON public.hr_sensitive_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_changed_at ON public.hr_sensitive_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_changed_by ON public.hr_sensitive_audit_log(changed_by);

COMMENT ON TABLE public.hr_sensitive_audit_log IS
'Immutable audit trail for HR-sensitive mutations (salary, contract, leave approvals, incentive edits).';

CREATE OR REPLACE FUNCTION public.log_hr_sensitive_audit_event(
  p_table_name TEXT,
  p_record_id UUID,
  p_employee_id UUID,
  p_action TEXT,
  p_old_data JSONB,
  p_new_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by UUID;
  v_changed_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_changed_by := auth.uid();

  IF p_action IN ('UPDATE', 'APPROVAL_UPDATE') THEN
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::TEXT[])
    INTO v_changed_fields
    FROM (
      SELECT k
      FROM (
        SELECT jsonb_object_keys(COALESCE(p_old_data, '{}'::jsonb)) AS k
        UNION
        SELECT jsonb_object_keys(COALESCE(p_new_data, '{}'::jsonb)) AS k
      ) all_keys
      WHERE (COALESCE(p_old_data, '{}'::jsonb) -> k)
            IS DISTINCT FROM
            (COALESCE(p_new_data, '{}'::jsonb) -> k)
    ) diffs;
  END IF;

  INSERT INTO public.hr_sensitive_audit_log (
    table_name,
    record_id,
    employee_id,
    action,
    changed_by,
    changed_fields,
    old_data,
    new_data
  )
  VALUES (
    p_table_name,
    p_record_id,
    p_employee_id,
    p_action,
    v_changed_by,
    v_changed_fields,
    p_old_data,
    p_new_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_hr_sensitive_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_employee_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  v_record_id := NULLIF(COALESCE(v_new_data ->> 'id', v_old_data ->> 'id'), '')::UUID;
  v_employee_id := NULLIF(COALESCE(v_new_data ->> 'employee_id', v_old_data ->> 'employee_id'), '')::UUID;

  PERFORM public.log_hr_sensitive_audit_event(
    TG_TABLE_NAME,
    v_record_id,
    v_employee_id,
    TG_OP,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_leave_approval_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
    OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
    OR OLD.review_notes IS DISTINCT FROM NEW.review_notes
  )
  AND NEW.status IN ('approved'::public.leave_request_status, 'rejected'::public.leave_request_status, 'cancelled'::public.leave_request_status)
  THEN
    PERFORM public.log_hr_sensitive_audit_event(
      'leave_requests',
      NEW.id,
      NEW.employee_id,
      'APPROVAL_UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_hr_sensitive_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hr_sensitive_audit_log is immutable and cannot be modified';
END;
$$;

ALTER TABLE public.hr_sensitive_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and HR managers can view HR sensitive audit log" ON public.hr_sensitive_audit_log;
CREATE POLICY "Admins and HR managers can view HR sensitive audit log"
  ON public.hr_sensitive_audit_log FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

GRANT SELECT ON public.hr_sensitive_audit_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_sensitive_audit_log FROM authenticated, anon;

DROP TRIGGER IF EXISTS prevent_hr_sensitive_audit_log_mutations ON public.hr_sensitive_audit_log;
CREATE TRIGGER prevent_hr_sensitive_audit_log_mutations
  BEFORE UPDATE OR DELETE ON public.hr_sensitive_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hr_sensitive_audit_log_mutation();

-- Contracts
DROP TRIGGER IF EXISTS audit_employment_contracts_changes ON public.employment_contracts;
CREATE TRIGGER audit_employment_contracts_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

-- Salary / compensation rates
DROP TRIGGER IF EXISTS audit_compensation_rates_changes ON public.compensation_rates;
CREATE TRIGGER audit_compensation_rates_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.compensation_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

-- Leave approvals only
DROP TRIGGER IF EXISTS audit_leave_approval_changes ON public.leave_requests;
CREATE TRIGGER audit_leave_approval_changes
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_leave_approval_changes();

-- Incentive edits
DROP TRIGGER IF EXISTS audit_incentive_rules_changes ON public.incentive_rules;
CREATE TRIGGER audit_incentive_rules_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.incentive_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

DROP TRIGGER IF EXISTS audit_employee_incentives_changes ON public.employee_incentives;
CREATE TRIGGER audit_employee_incentives_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_incentives
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

-- ================================================================
-- Migration 12: HR Compliance Access Logs + Retention
-- ================================================================
-- HR compliance: access logs + data retention controls
-- Scope: compliance-sensitive HR records

CREATE TABLE IF NOT EXISTS public.hr_compliance_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('SELECT', 'VIEW_SENSITIVE', 'EXPORT', 'DOWNLOAD')),
  purpose TEXT,
  request_path TEXT,
  request_method TEXT,
  accessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_table_name ON public.hr_compliance_access_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_employee_id ON public.hr_compliance_access_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_accessed_by ON public.hr_compliance_access_logs(accessed_by);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_accessed_at ON public.hr_compliance_access_logs(accessed_at DESC);

COMMENT ON TABLE public.hr_compliance_access_logs IS
'Access log for compliance-sensitive HR records (read/view/export/download events).';

CREATE TABLE IF NOT EXISTS public.hr_data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  enforcement_action TEXT NOT NULL CHECK (enforcement_action IN ('delete', 'archive', 'redact', 'report_only')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_data_retention_policies_active ON public.hr_data_retention_policies(is_active);

COMMENT ON TABLE public.hr_data_retention_policies IS
'Retention policy catalog for compliance-sensitive HR tables.';

DROP TRIGGER IF EXISTS update_hr_data_retention_policies_updated_at ON public.hr_data_retention_policies;
CREATE TRIGGER update_hr_data_retention_policies_updated_at
  BEFORE UPDATE ON public.hr_data_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_data_retention_policies (table_name, retention_days, enforcement_action, notes)
VALUES
  ('hr_compliance_access_logs', 2190, 'delete', 'Retain 6 years of access logs, then purge.'),
  ('hr_sensitive_audit_log', 2555, 'redact', 'Retain audit metadata 7 years; redact payload after retention.'),
  ('hr_documents', 3650, 'archive', 'Archive HR documents older than 10 years unless legal hold is required externally.'),
  ('employment_contracts', 3650, 'report_only', 'Review contract retention before archival/deletion.'),
  ('compensation_rates', 3650, 'report_only', 'Review compensation retention before archival/deletion.'),
  ('leave_requests', 2555, 'report_only', 'Review leave records retention before archival/deletion.'),
  ('employee_incentives', 2555, 'report_only', 'Review incentive retention before archival/deletion.')
ON CONFLICT (table_name) DO UPDATE
SET retention_days = EXCLUDED.retention_days,
    enforcement_action = EXCLUDED.enforcement_action,
    notes = EXCLUDED.notes,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.log_hr_compliance_access(
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL,
  p_access_type TEXT DEFAULT 'SELECT',
  p_purpose TEXT DEFAULT NULL,
  p_request_path TEXT DEFAULT NULL,
  p_request_method TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_type TEXT;
BEGIN
  v_access_type := UPPER(COALESCE(p_access_type, 'SELECT'));

  IF v_access_type NOT IN ('SELECT', 'VIEW_SENSITIVE', 'EXPORT', 'DOWNLOAD') THEN
    RAISE EXCEPTION 'Invalid HR access type: %', v_access_type;
  END IF;

  INSERT INTO public.hr_compliance_access_logs (
    table_name,
    record_id,
    employee_id,
    access_type,
    purpose,
    request_path,
    request_method,
    accessed_by,
    metadata
  )
  VALUES (
    p_table_name,
    p_record_id,
    p_employee_id,
    v_access_type,
    p_purpose,
    p_request_path,
    p_request_method,
    auth.uid(),
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_hr_compliance_access_logs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hr_compliance_access_logs is immutable and cannot be modified';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_hr_data_retention(
  p_dry_run BOOLEAN DEFAULT true,
  p_reference_time TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  table_name TEXT,
  action TEXT,
  affected_rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_affected BIGINT;
BEGIN
  FOR v_policy IN
    SELECT table_name, retention_days, enforcement_action
    FROM public.hr_data_retention_policies
    WHERE is_active = true
    ORDER BY table_name
  LOOP
    v_affected := 0;

    IF v_policy.table_name = 'hr_compliance_access_logs' AND v_policy.enforcement_action = 'delete' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_compliance_access_logs
        WHERE accessed_at < (p_reference_time - make_interval(days => v_policy.retention_days));
      ELSE
        DELETE FROM public.hr_compliance_access_logs
        WHERE accessed_at < (p_reference_time - make_interval(days => v_policy.retention_days));
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'hr_sensitive_audit_log' AND v_policy.enforcement_action = 'redact' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_sensitive_audit_log
        WHERE changed_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND (old_data IS NOT NULL OR new_data IS NOT NULL);
      ELSE
        UPDATE public.hr_sensitive_audit_log
        SET old_data = NULL,
            new_data = NULL,
            changed_fields = ARRAY[]::TEXT[]
        WHERE changed_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND (old_data IS NOT NULL OR new_data IS NOT NULL);
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'hr_documents' AND v_policy.enforcement_action = 'archive' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_documents
        WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND status <> 'archived'::public.hr_document_status;
      ELSE
        UPDATE public.hr_documents
        SET status = 'archived'::public.hr_document_status,
            updated_at = now()
        WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND status <> 'archived'::public.hr_document_status;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'employment_contracts' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.employment_contracts
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'compensation_rates' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.compensation_rates
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'leave_requests' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.leave_requests
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'employee_incentives' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.employee_incentives
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSE
      v_affected := 0;
    END IF;

    RETURN QUERY SELECT v_policy.table_name, v_policy.enforcement_action, v_affected;
  END LOOP;
END;
$$;

ALTER TABLE public.hr_compliance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_data_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and HR managers can view HR compliance access logs" ON public.hr_compliance_access_logs;
CREATE POLICY "Admins and HR managers can view HR compliance access logs"
  ON public.hr_compliance_access_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Admins and HR managers can view retention policies" ON public.hr_data_retention_policies;
CREATE POLICY "Admins and HR managers can view retention policies"
  ON public.hr_data_retention_policies FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Admins and HR managers can manage retention policies" ON public.hr_data_retention_policies;
CREATE POLICY "Admins and HR managers can manage retention policies"
  ON public.hr_data_retention_policies FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

GRANT EXECUTE ON FUNCTION public.log_hr_compliance_access(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_hr_data_retention(BOOLEAN, TIMESTAMPTZ) TO authenticated;
GRANT SELECT ON public.hr_compliance_access_logs TO authenticated;
GRANT SELECT ON public.hr_data_retention_policies TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_compliance_access_logs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.hr_data_retention_policies FROM anon;

DROP TRIGGER IF EXISTS prevent_hr_compliance_access_logs_mutation ON public.hr_compliance_access_logs;
CREATE TRIGGER prevent_hr_compliance_access_logs_mutation
  BEFORE UPDATE OR DELETE ON public.hr_compliance_access_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hr_compliance_access_logs_mutation();

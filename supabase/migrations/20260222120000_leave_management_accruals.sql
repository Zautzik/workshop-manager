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

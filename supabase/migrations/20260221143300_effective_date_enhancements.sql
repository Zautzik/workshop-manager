-- Enhanced effective-date support for contracts and compensation
-- Adds non-overlapping constraints, historical query helpers, and payroll calculation functions

-- -----------------------------------------------------------------------------
-- Non-overlapping date range constraints
-- -----------------------------------------------------------------------------

-- Prevent overlapping employment contracts for the same employee
-- Using exclusion constraint with gist and daterange
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.employment_contracts
  DROP CONSTRAINT IF EXISTS employment_contracts_no_overlap;

ALTER TABLE public.employment_contracts
  ADD CONSTRAINT employment_contracts_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, COALESCE(end_date, '9999-12-31'::date), '[]') WITH &&
  );

COMMENT ON CONSTRAINT employment_contracts_no_overlap ON public.employment_contracts IS 
  'Ensures no overlapping contract periods for the same employee. Treats NULL end_date as open-ended (9999-12-31).';

-- Prevent overlapping compensation rates for the same employee
ALTER TABLE public.compensation_rates
  DROP CONSTRAINT IF EXISTS compensation_rates_no_overlap;

ALTER TABLE public.compensation_rates
  ADD CONSTRAINT compensation_rates_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
  );

COMMENT ON CONSTRAINT compensation_rates_no_overlap ON public.compensation_rates IS 
  'Ensures no overlapping compensation periods for the same employee. Treats NULL effective_to as current rate.';

-- -----------------------------------------------------------------------------
-- Helper functions for effective-dated queries
-- -----------------------------------------------------------------------------

-- Get active employment contract for an employee at a specific date
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

COMMENT ON FUNCTION public.get_contract_at_date IS 
  'Returns the active employment contract for an employee at a specific date. Returns NULL if no contract exists.';

-- Get active compensation rate for an employee at a specific date
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

COMMENT ON FUNCTION public.get_compensation_at_date IS 
  'Returns the active compensation rate for an employee at a specific date. Returns NULL if no rate exists.';

-- Calculate total pay for a work period using historical rates
CREATE OR REPLACE FUNCTION public.calculate_payroll_for_assignment(
  p_employee_id UUID,
  p_assignment_date DATE,
  p_regular_hours NUMERIC DEFAULT 8,
  p_overtime_50_hours NUMERIC DEFAULT 0,
  p_overtime_100_hours NUMERIC DEFAULT 0,
  p_night_hours NUMERIC DEFAULT 0,
  p_weekend_hours NUMERIC DEFAULT 0
)
RETURNS TABLE (
  base_pay NUMERIC,
  overtime_50_pay NUMERIC,
  overtime_100_pay NUMERIC,
  night_differential NUMERIC,
  weekend_differential NUMERIC,
  total_pay NUMERIC,
  hourly_rate NUMERIC,
  currency_code TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp_rate public.compensation_rates;
  v_base_pay NUMERIC;
  v_ot50_pay NUMERIC;
  v_ot100_pay NUMERIC;
  v_night_diff NUMERIC;
  v_weekend_diff NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Get compensation rate at assignment date
  SELECT * INTO v_comp_rate
  FROM public.get_compensation_at_date(p_employee_id, p_assignment_date);
  
  IF v_comp_rate IS NULL THEN
    RAISE EXCEPTION 'No compensation rate found for employee % at date %', 
      p_employee_id, p_assignment_date;
  END IF;
  
  -- Calculate each component
  v_base_pay := ROUND(p_regular_hours * v_comp_rate.hourly_rate, 2);
  v_ot50_pay := ROUND(p_overtime_50_hours * v_comp_rate.hourly_rate * v_comp_rate.overtime_multiplier_50, 2);
  v_ot100_pay := ROUND(p_overtime_100_hours * v_comp_rate.hourly_rate * v_comp_rate.overtime_multiplier_100, 2);
  v_night_diff := ROUND(p_night_hours * v_comp_rate.hourly_rate * (v_comp_rate.night_shift_multiplier - 1), 2);
  v_weekend_diff := ROUND(p_weekend_hours * v_comp_rate.hourly_rate * (v_comp_rate.weekend_multiplier - 1), 2);
  v_total := v_base_pay + v_ot50_pay + v_ot100_pay + v_night_diff + v_weekend_diff;
  
  RETURN QUERY SELECT 
    v_base_pay,
    v_ot50_pay,
    v_ot100_pay,
    v_night_diff,
    v_weekend_diff,
    v_total,
    v_comp_rate.hourly_rate,
    v_comp_rate.currency_code;
END;
$$;

COMMENT ON FUNCTION public.calculate_payroll_for_assignment IS 
  'Calculates detailed payroll breakdown using historical compensation rates. Handles regular, OT50%, OT100%, night differential, and weekend premium.';

-- Calculate total payroll for a date range (aggregates multiple days)
CREATE OR REPLACE FUNCTION public.calculate_payroll_for_period(
  p_employee_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_regular_hours NUMERIC,
  total_overtime_hours NUMERIC,
  total_pay NUMERIC,
  assignments_count INTEGER,
  date_range daterange,
  breakdown JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regular_hours NUMERIC := 0;
  v_ot_hours NUMERIC := 0;
  v_total_pay NUMERIC := 0;
  v_count INTEGER := 0;
  v_breakdown JSONB := '[]'::jsonb;
  v_assignment RECORD;
  v_payroll RECORD;
BEGIN
  -- Iterate through all assignments in period
  FOR v_assignment IN
    SELECT 
      wa.date,
      wa.shift_id,
      s.start_time,
      s.end_time,
      wa.role,
      CASE 
        WHEN wa.role ILIKE '%overtime%' THEN 8.0
        ELSE 8.0
      END as hours,
      CASE 
        WHEN wa.role ILIKE '%overtime%' THEN true
        ELSE false
      END as is_overtime
    FROM public.worker_assignments wa
    LEFT JOIN public.shifts s ON wa.shift_id = s.id
    WHERE wa.employee_id = p_employee_id
      AND wa.date BETWEEN p_start_date AND p_end_date
    ORDER BY wa.date
  LOOP
    v_count := v_count + 1;
    
    -- Calculate pay for this day
    IF v_assignment.is_overtime THEN
      v_ot_hours := v_ot_hours + v_assignment.hours;
      
      SELECT * INTO v_payroll
      FROM public.calculate_payroll_for_assignment(
        p_employee_id,
        v_assignment.date,
        0, -- no regular hours on OT shift
        v_assignment.hours, -- OT hours at 50%
        0, 0, 0
      );
    ELSE
      v_regular_hours := v_regular_hours + v_assignment.hours;
      
      SELECT * INTO v_payroll
      FROM public.calculate_payroll_for_assignment(
        p_employee_id,
        v_assignment.date,
        v_assignment.hours,
        0, 0, 0, 0
      );
    END IF;
    
    v_total_pay := v_total_pay + v_payroll.total_pay;
    
    -- Add to breakdown
    v_breakdown := v_breakdown || jsonb_build_object(
      'date', v_assignment.date,
      'hours', v_assignment.hours,
      'is_overtime', v_assignment.is_overtime,
      'pay', v_payroll.total_pay,
      'hourly_rate', v_payroll.hourly_rate
    );
  END LOOP;
  
  RETURN QUERY SELECT 
    v_regular_hours,
    v_ot_hours,
    v_total_pay,
    v_count,
    daterange(p_start_date, p_end_date, '[]'),
    v_breakdown;
END;
$$;

COMMENT ON FUNCTION public.calculate_payroll_for_period IS 
  'Calculates aggregated payroll for a date range with detailed breakdown. Uses historical rates for each day.';

-- Get compensation history for an employee (audit trail)
CREATE OR REPLACE FUNCTION public.get_compensation_history(
  p_employee_id UUID
)
RETURNS TABLE (
  effective_from DATE,
  effective_to DATE,
  hourly_rate NUMERIC,
  overtime_multiplier_50 NUMERIC,
  overtime_multiplier_100 NUMERIC,
  currency_code TEXT,
  rate_change_amount NUMERIC,
  rate_change_percent NUMERIC,
  days_active INTEGER,
  notes TEXT
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
    cr.currency_code,
    cr.hourly_rate - LAG(cr.hourly_rate) OVER (ORDER BY cr.effective_from) as rate_change_amount,
    CASE 
      WHEN LAG(cr.hourly_rate) OVER (ORDER BY cr.effective_from) > 0
      THEN ROUND(
        ((cr.hourly_rate - LAG(cr.hourly_rate) OVER (ORDER BY cr.effective_from)) 
         / LAG(cr.hourly_rate) OVER (ORDER BY cr.effective_from) * 100)::numeric, 
        2
      )
      ELSE NULL
    END as rate_change_percent,
    CASE 
      WHEN cr.effective_to IS NOT NULL 
      THEN (cr.effective_to - cr.effective_from)
      ELSE (CURRENT_DATE - cr.effective_from)
    END as days_active,
    NULL::text as notes
  FROM public.compensation_rates cr
  WHERE cr.employee_id = p_employee_id
  ORDER BY cr.effective_from DESC;
$$;

COMMENT ON FUNCTION public.get_compensation_history IS 
  'Returns full compensation history with rate changes and duration. Useful for audit trails and salary reviews.';

-- Validate no gaps in contract coverage (ensure continuous employment)
CREATE OR REPLACE FUNCTION public.validate_contract_coverage(
  p_employee_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  has_complete_coverage BOOLEAN,
  days_with_coverage INTEGER,
  days_expected INTEGER,
  coverage_gaps JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_covered INTEGER;
  v_days_expected INTEGER;
  v_gaps JSONB := '[]'::jsonb;
  v_date DATE;
  v_has_contract BOOLEAN;
  v_gap_start DATE := NULL;
BEGIN
  v_days_expected := (p_to_date - p_from_date) + 1;
  v_days_covered := 0;
  
  -- Check each day in range
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
      
      -- End any ongoing gap
      IF v_gap_start IS NOT NULL THEN
        v_gaps := v_gaps || jsonb_build_object(
          'start_date', v_gap_start,
          'end_date', v_date - 1,
          'days', v_date - v_gap_start
        );
        v_gap_start := NULL;
      END IF;
    ELSE
      -- Start new gap if not already in one
      IF v_gap_start IS NULL THEN
        v_gap_start := v_date;
      END IF;
    END IF;
  END LOOP;
  
  -- Close any open gap
  IF v_gap_start IS NOT NULL THEN
    v_gaps := v_gaps || jsonb_build_object(
      'start_date', v_gap_start,
      'end_date', p_to_date,
      'days', (p_to_date - v_gap_start) + 1
    );
  END IF;
  
  RETURN QUERY SELECT 
    (v_days_covered = v_days_expected)::boolean,
    v_days_covered,
    v_days_expected,
    v_gaps;
END;
$$;

COMMENT ON FUNCTION public.validate_contract_coverage IS 
  'Validates continuous contract coverage for a date range. Returns gaps if any exist. Useful for payroll verification.';

-- Get contract changes for an employee (audit trail)
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
  days_active INTEGER,
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
    CASE 
      WHEN ec.end_date IS NOT NULL 
      THEN (ec.end_date - ec.start_date)
      ELSE (CURRENT_DATE - ec.start_date)
    END as days_active,
    (ec.end_date IS NULL OR ec.end_date >= CURRENT_DATE) as is_current
  FROM public.employment_contracts ec
  WHERE ec.employee_id = p_employee_id
  ORDER BY ec.start_date DESC;
$$;

COMMENT ON FUNCTION public.get_contract_history IS 
  'Returns employment contract history with duration and current status. Useful for workforce planning and compliance.';

-- -----------------------------------------------------------------------------
-- Validation trigger: Warn about rate changes without contract alignment
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_compensation_contract_alignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_contract BOOLEAN;
BEGIN
  -- Check if employee has active contract at effective_from date
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

COMMENT ON FUNCTION public.validate_compensation_contract_alignment IS 
  'Trigger function to warn when compensation rates are set without corresponding employment contracts';

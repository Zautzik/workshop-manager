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

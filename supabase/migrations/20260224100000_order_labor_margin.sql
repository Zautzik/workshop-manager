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

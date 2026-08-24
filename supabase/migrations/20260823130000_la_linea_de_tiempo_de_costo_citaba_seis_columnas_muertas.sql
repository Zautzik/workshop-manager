-- La linea de tiempo de costo citaba seis columnas muertas
--
-- get_employee_cost_timeline nunca se toco desde que se escribio (2026-02-23)
-- y cita seis nombres que no existen: worker_assignments.assignment_date
-- (real: date), employment_contracts.contract_start_date/contract_end_date
-- (real: start_date/end_date), employment_contracts.regular_hours_limit /
-- ot50_hours_limit (nunca existieron), compensation_rates.effective_date /
-- end_date (real: effective_from/effective_to), employees.name (real:
-- full_name), y employee_incentives.payment_date (real: awarded_date).
--
-- Postgres no valida el cuerpo de una funcion plpgsql al crearla, solo cuando
-- corre — asi que esto paso tsc, paso cada migracion, y solo revienta al abrir
-- el grafico de costo por empleado (auditoria 2026-08, misma clase que NOTES
-- Section 7).
--
-- El defecto mas hondo no es de nombres: `regular_hours_limit` y
-- `ot50_hours_limit` describian dos escalones de sobretiempo por dia que el
-- esquema nunca tuvo columnas para sostener. `labor-attribution.ts` ya
-- resuelve esto mismo, probado, con un solo escalon diario — 9 horas base
-- (DEFAULTS.baseHoursPerDay), el resto a `overtime_multiplier_50`. Esta
-- funcion adopta la misma regla en vez de inventar una segunda que nada mas
-- en la aplicacion conoce. `ot100_hours`/`ot100_pay` se mantienen en la forma
-- de salida —por si algun llamador los lee— pero en cero: no hay de donde
-- sacar un segundo escalon real.
--
-- Los multiplicadores de noche (0.15) y fin de semana (0.20) tambien estaban
-- fijos a mano cuando compensation_rates ya trae night_shift_multiplier y
-- weekend_multiplier por persona — se usan esos, con el valor fijo como piso
-- si una tarifa no los trae.

BEGIN;

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
  -- Mismo umbral diario que labor-attribution.ts (DEFAULTS.baseHoursPerDay) —
  -- una sola fuente de qué cuenta como jornada normal, no dos que puedan
  -- divergir.
  v_base_hours_per_day CONSTANT NUMERIC := 9;
BEGIN
  IF p_granularity = 'week' THEN
    v_date_trunc := 'week';
    v_interval := '1 week'::INTERVAL;
  ELSE
    v_date_trunc := 'month';
    v_interval := '1 month'::INTERVAL;
  END IF;

  RETURN QUERY
  WITH period_series AS (
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
    SELECT
      ps.period_start,
      ps.period_end,
      wa.employee_id,
      COALESCE(SUM(wa.hours_worked), 0) as total_hours,
      COALESCE(SUM(LEAST(wa.hours_worked, v_base_hours_per_day)), 0) as base_hours,
      COALESCE(SUM(GREATEST(wa.hours_worked - v_base_hours_per_day, 0)), 0) as ot50_hours,
      0::NUMERIC as ot100_hours,
      COALESCE(SUM(CASE WHEN s.is_night_shift THEN wa.hours_worked ELSE 0 END), 0) as night_hours,
      COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM wa.date) IN (0, 6) THEN wa.hours_worked ELSE 0 END), 0) as weekend_hours,
      COALESCE(SUM(LEAST(wa.hours_worked, v_base_hours_per_day) * cr.hourly_rate), 0) as base_pay,
      COALESCE(SUM(
        GREATEST(wa.hours_worked - v_base_hours_per_day, 0)
        * cr.hourly_rate * COALESCE(cr.overtime_multiplier_50, 1.5)
      ), 0) as ot50_pay,
      0::NUMERIC as ot100_pay,
      COALESCE(SUM(
        CASE WHEN s.is_night_shift
        THEN wa.hours_worked * cr.hourly_rate * COALESCE(cr.night_shift_multiplier, 0.15)
        ELSE 0 END
      ), 0) as night_differential,
      COALESCE(SUM(
        CASE WHEN EXTRACT(DOW FROM wa.date) IN (0, 6)
        THEN wa.hours_worked * cr.hourly_rate * COALESCE(cr.weekend_multiplier, 0.20)
        ELSE 0 END
      ), 0) as weekend_differential
    FROM period_series ps
    CROSS JOIN LATERAL (
      SELECT * FROM employees e WHERE e.id = p_employee_id
    ) e
    LEFT JOIN worker_assignments wa ON wa.employee_id = e.id
      AND wa.date BETWEEN ps.period_start AND ps.period_end
    LEFT JOIN employment_contracts ec ON ec.employee_id = wa.employee_id
      AND ec.start_date <= wa.date
      AND (ec.end_date IS NULL OR ec.end_date >= wa.date)
    LEFT JOIN shifts s ON s.id = wa.shift_id
    LEFT JOIN compensation_rates cr ON cr.employee_id = wa.employee_id
      AND cr.effective_from <= wa.date
      AND (cr.effective_to IS NULL OR cr.effective_to >= wa.date)
    GROUP BY ps.period_start, ps.period_end, wa.employee_id
  ),
  incentive_costs AS (
    SELECT
      ps.period_start,
      ps.period_end,
      ei.employee_id,
      COALESCE(SUM(ei.amount), 0) as total_incentives
    FROM period_series ps
    CROSS JOIN employee_incentives ei
    WHERE ei.employee_id = p_employee_id
      AND ei.awarded_date BETWEEN ps.period_start AND ps.period_end
    GROUP BY ps.period_start, ps.period_end, ei.employee_id
  )
  SELECT
    ps.period_start,
    ps.period_end,
    e.id as employee_id,
    e.full_name as employee_name,
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

COMMENT ON FUNCTION get_employee_cost_timeline IS
'Serie de tiempo de costo de mano de obra por empleado. Sobretiempo a un solo escalon diario (9h base, resto a overtime_multiplier_50) — mismo modelo que src/lib/labor-attribution.ts, no dos. ot100_hours/ot100_pay se mantienen en cero por compatibilidad de forma; no hay un segundo escalon en el esquema real.';

COMMIT;

-- La colación no se paga: un turno tiene horas pagadas, no sólo un horario
--
-- ── Lo que había ────────────────────────────────────────────────────────────
--
-- Toda hora de turno se calculaba como fin − inicio. El Taller (07–16) son 8 h
-- trabajadas y una colación sin goce (confirmado por la planta, 2026-10-28),
-- pero contaba 9 h en tres lugares:
--
--   - la compuerta de cumplimiento: un contrato de 8 h/día no podía asignarse
--     al Taller, y uno de 45 h/semana no podía hacer ni un sábado;
--   - la nómina mensual (`calculate_monthly_payroll`): 1 h de más por día;
--   - el Cronograma, que planificaba la hora de almuerzo como trabajo.
--
-- ── Lo que queda ────────────────────────────────────────────────────────────
--
-- 1. `shifts.break_start` y `shifts.break_minutes`: cuándo empieza la pausa
--    no pagada y cuánto dura. El Taller: 13:00, 60 min. La hora es un supuesto
--    (la planta confirmó la colación, no la hora) y se corrige en la fila.
-- 2. `shift_paid_hours(inicio, fin, pausa)`: LA regla de horas pagadas. La
--    usan la compuerta y la nómina; la app usa la misma en `shift-hours.ts`.
-- 3. Las dos funciones se recrean IGUALES salvo la expresión de horas (generada
--    desde sus definiciones vigentes, 20260811150000 y 20260811140000). El
--    descanso entre turnos sigue midiéndose con la hora real de salida: la
--    colación no cambia a qué hora termina el turno.
--
-- Las asignaciones ya pagadas a filas archivadas no cambian: esas filas no
-- tienen pausa (break_minutes = 0), así que su cálculo es el de siempre.

BEGIN;

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_start   TIME;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_minutes SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_pausa_valida') THEN
    ALTER TABLE public.shifts ADD CONSTRAINT shifts_pausa_valida
      CHECK (break_minutes BETWEEN 0 AND 240 AND (break_minutes = 0 OR break_start IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.shifts.break_start IS
  'Inicio de la pausa no pagada (colación). NULL si el turno no tiene.';
COMMENT ON COLUMN public.shifts.break_minutes IS
  'Minutos de pausa no pagada dentro del turno. Se descuentan de las horas pagadas (shift_paid_hours).';

UPDATE public.shifts
SET break_start = '13:00', break_minutes = 60
WHERE code = 'taller' AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.shift_paid_hours(p_start TIME, p_end TIME, p_break_minutes INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (EXTRACT(EPOCH FROM (p_end - p_start)) / 3600.0
      + CASE WHEN p_end <= p_start THEN 24 ELSE 0 END)
    - COALESCE(p_break_minutes, 0) / 60.0,
    0
  )::NUMERIC;
$$;

COMMENT ON FUNCTION public.shift_paid_hours(TIME, TIME, INTEGER) IS
  'Horas pagadas de un turno: de inicio a fin (cruzando la medianoche si hace falta) menos la pausa no pagada.';

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
  -- La identidad es `employees.id` y nada más. El puente hacia la vieja tabla
  -- `workers` se retiró con ella.
  v_employee_id := NEW.employee_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'La asignación necesita un empleado válido (employee_id).';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = NEW.shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'El turno % no existe.', NEW.shift_id;
  END IF;

  SELECT * INTO v_contract
  FROM public.get_contract_at_date(v_employee_id, NEW.date);

  -- Sin contrato no se bloquea la asignación: se puede programar a alguien que
  -- todavía no tiene papeles firmados. Las comprobaciones de cumplimiento sólo
  -- aplican cuando hay un contrato contra el cual comprobar.
  IF v_contract IS NULL THEN
    RETURN NEW;
  END IF;

  v_shift_start := (NEW.date + v_shift.start_time);
  v_shift_end := (NEW.date + v_shift.end_time);
  IF v_shift_end <= v_shift_start THEN
    v_shift_end := v_shift_end + INTERVAL '1 day';
  END IF;

  v_shift_hours := public.shift_paid_hours(v_shift.start_time, v_shift.end_time, v_shift.break_minutes);

  -- ── Tope diario ───────────────────────────────────────────────────────────
  -- Se cuentan las horas del TURNO, no las trabajadas: un turno de ocho horas
  -- ocupa el día aunque la persona haya estado dos. Por eso, en la práctica,
  -- nadie admite más de una asignación por día.

  SELECT COALESCE(SUM(public.shift_paid_hours(s.start_time, s.end_time, s.break_minutes)), 0)
  INTO v_daily_hours
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE a.employee_id = v_employee_id
    AND a.date = NEW.date
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  v_daily_hours := v_daily_hours + v_shift_hours;
  IF v_daily_hours > v_contract.max_hours_per_day THEN
    RAISE EXCEPTION 'Excede las horas diarias del contrato: % h contra un tope de % h.',
      round(v_daily_hours, 2), round(v_contract.max_hours_per_day, 2);
  END IF;

  -- ── Tope semanal ──────────────────────────────────────────────────────────
  -- La semana es de lunes a domingo y NO se corta en el fin de mes.

  v_week_start := date_trunc('week', NEW.date)::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;

  SELECT COALESCE(SUM(public.shift_paid_hours(s.start_time, s.end_time, s.break_minutes)), 0)
  INTO v_weekly_hours
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE a.employee_id = v_employee_id
    AND a.date BETWEEN v_week_start AND v_week_end
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  v_weekly_hours := v_weekly_hours + v_shift_hours;
  IF v_weekly_hours > v_contract.max_hours_per_week THEN
    RAISE EXCEPTION 'Excede las horas semanales del contrato: % h contra un tope de % h.',
      round(v_weekly_hours, 2), round(v_contract.max_hours_per_week, 2);
  END IF;

  -- ── Horas extra ───────────────────────────────────────────────────────────

  v_overtime_hours := GREATEST(0, v_weekly_hours - v_contract.base_hours_per_week);
  IF NOT v_contract.overtime_allowed AND v_overtime_hours > 0 THEN
    RAISE EXCEPTION 'El contrato no permite horas extra.';
  END IF;

  IF v_overtime_hours > v_contract.overtime_cap_hours_per_week THEN
    RAISE EXCEPTION 'Excede el tope de horas extra: % h contra un máximo de % h.',
      round(v_overtime_hours, 2), round(v_contract.overtime_cap_hours_per_week, 2);
  END IF;

  -- ── Descanso mínimo entre turnos ──────────────────────────────────────────

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
  WHERE a.employee_id = v_employee_id
    AND (a.date < NEW.date OR (a.date = NEW.date AND s.start_time < v_shift.start_time))
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  IF v_prev_end IS NOT NULL THEN
    v_rest_hours := EXTRACT(EPOCH FROM (v_shift_start - v_prev_end)) / 3600.0;
    IF v_rest_hours < v_contract.minimum_rest_hours THEN
      RAISE EXCEPTION 'No se respeta el descanso mínimo entre turnos: % h contra las % h que pide el contrato.',
        round(v_rest_hours, 2), round(v_contract.minimum_rest_hours, 2);
    END IF;
  END IF;

  SELECT MIN(a.date + s.start_time)
  INTO v_next_start
  FROM public.worker_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE a.employee_id = v_employee_id
    AND (a.date > NEW.date OR (a.date = NEW.date AND s.start_time > v_shift.start_time))
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  IF v_next_start IS NOT NULL THEN
    v_rest_hours := EXTRACT(EPOCH FROM (v_next_start - v_shift_end)) / 3600.0;
    IF v_rest_hours < v_contract.minimum_rest_hours THEN
      RAISE EXCEPTION 'No se respeta el descanso mínimo entre turnos: % h contra las % h que pide el contrato.',
        round(v_rest_hours, 2), round(v_contract.minimum_rest_hours, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
      wa.employee_id AS employee_id,
      wa.date,
      wa.role,
      CASE WHEN wa.role ILIKE '%overtime%' THEN true ELSE false END AS is_overtime,
      public.shift_paid_hours(s.start_time, s.end_time, s.break_minutes)::NUMERIC AS hours,
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
    WHERE wa.date BETWEEN v_start_date AND v_end_date
      AND wa.employee_id IS NOT NULL
      AND (p_employee_id IS NULL OR wa.employee_id = p_employee_id)
  ),
  assignment_pay AS (
    SELECT
      ah.employee_id,
      ah.hours,
      ah.is_overtime,
      ROUND(
        (CASE WHEN ah.is_overtime THEN 0 ELSE ah.hours END)
        * COALESCE(cr.hourly_rate, 0),
        2
      )::NUMERIC AS base_pay,
      ROUND(
        (CASE WHEN ah.is_overtime THEN ah.hours ELSE 0 END)
        * COALESCE(cr.hourly_rate, 0)
        * (
          CASE
            WHEN ah.is_overtime AND (ah.role ILIKE '%100%') THEN COALESCE(cr.overtime_multiplier_100, 2)
            ELSE COALESCE(cr.overtime_multiplier_50, 1.5)
          END
        ),
        2
      )::NUMERIC AS overtime_pay,
      ROUND(
        (CASE WHEN ah.is_night THEN ah.hours ELSE 0 END)
        * COALESCE(cr.hourly_rate, 0)
        * GREATEST(COALESCE(cr.night_shift_multiplier, 1) - 1, 0),
        2
      )::NUMERIC AS night_differential,
      ROUND(
        (CASE WHEN ah.is_weekend THEN ah.hours ELSE 0 END)
        * COALESCE(cr.hourly_rate, 0)
        * GREATEST(COALESCE(cr.weekend_multiplier, 1) - 1, 0),
        2
      )::NUMERIC AS weekend_differential,
      COALESCE(cr.currency_code, 'USD')::TEXT AS currency_code
    FROM assignment_hours ah
    LEFT JOIN LATERAL public.get_compensation_at_date(ah.employee_id, ah.date) cr ON true
  ),
  payroll_agg AS (
    SELECT
      employee_id,
      COALESCE(SUM(CASE WHEN is_overtime THEN 0 ELSE hours END), 0)::NUMERIC AS regular_hours,
      COALESCE(SUM(CASE WHEN is_overtime THEN hours ELSE 0 END), 0)::NUMERIC AS overtime_hours,
      COALESCE(SUM(base_pay), 0)::NUMERIC AS base_pay,
      COALESCE(SUM(overtime_pay), 0)::NUMERIC AS overtime_pay,
      COALESCE(SUM(night_differential), 0)::NUMERIC AS night_differential,
      COALESCE(SUM(weekend_differential), 0)::NUMERIC AS weekend_differential,
      COALESCE(SUM(base_pay + overtime_pay + night_differential + weekend_differential), 0)::NUMERIC AS assignment_pay,
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

COMMIT;

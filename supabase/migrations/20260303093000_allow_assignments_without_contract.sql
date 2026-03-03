-- Allow scheduling assignments even when no active employment contract exists.
-- Keeps compliance checks only when a contract is present.

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

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = NEW.shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift % not found.', NEW.shift_id;
  END IF;

  SELECT * INTO v_contract
  FROM public.get_contract_at_date(v_employee_id, NEW.date);

  -- No contract is no longer a blocker for assigning workers.
  -- Keep all compliance checks only when an active contract exists.
  IF v_contract IS NULL THEN
    RETURN NEW;
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

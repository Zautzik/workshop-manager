-- Los mensajes del disparador de turnos salían rotos.
--
-- El supervisor que intenta asignar a alguien y no puede recibía esto:
--
--     No se respeta el descanso mínimo (8.0000000000000000.2f h < 12.00.2f h)
--
-- `RAISE` de plpgsql no entiende los especificadores de printf. Sustituye el
-- `%` por el argumento y deja `.2f` como texto literal, así que el número sale
-- con dieciséis decimales y con basura pegada. El defecto venía de la migración
-- original de 2026-02-22 y se arrastró en cada `CREATE OR REPLACE` desde
-- entonces, incluido el mío de esta semana.
--
-- Nadie lo vio porque el disparador estaba roto de otra manera: fallaba antes
-- de llegar a formatear nada.
--
-- Se redondea en el argumento —que es donde plpgsql sí sabe hacerlo— y de paso
-- los mensajes dicen qué pasó en vez de sólo comparar dos números. Un supervisor
-- no está depurando una función: está tratando de armar el turno del martes.

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

  v_shift_hours := EXTRACT(EPOCH FROM (v_shift_end - v_shift_start)) / 3600.0;

  -- ── Tope diario ───────────────────────────────────────────────────────────
  -- Se cuentan las horas del TURNO, no las trabajadas: un turno de ocho horas
  -- ocupa el día aunque la persona haya estado dos. Por eso, en la práctica,
  -- nadie admite más de una asignación por día.

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

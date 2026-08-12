-- El disparador de turnos buscaba una columna que se borró hace nueve días.
--
-- `20260802140000_retirar_workers.sql` eliminó `worker_assignments.worker_id`
-- junto con la tabla `workers`. La función `validate_worker_assignment_compliance`
-- seguía referenciando `NEW.worker_id` en cuatro lugares, y también
-- `employees.worker_legacy_id`, que la misma migración retiró.
--
-- Resultado: TODO insert en `worker_assignments` falla desde el 2 de agosto con
--
--     ERROR 42703: record "new" has no field "worker_id"
--
-- No es un problema del sembrador. Es que **la app no puede asignar gente a una
-- máquina desde hace nueve días**: el tablero de Planta llama a
-- `/api/worker-assignments`, el POST llega a la base y el disparador lo tumba.
-- Nadie lo notó porque todavía no hay nadie usándola.
--
-- ── Por qué no se cayó antes ────────────────────────────────────────────────
--
-- Porque un DROP COLUMN no revisa el cuerpo de las funciones plpgsql. Postgres
-- valida el SQL de una función cuando la EJECUTA, no cuando la crea: mientras
-- nadie inserte un turno, la referencia rota es texto inerte. Es la misma
-- familia del `worker_legacy_id` que quedó en cinco archivos de TypeScript
-- porque las cadenas de `select()` de PostgREST no se verifican con el
-- compilador.
--
-- La lección práctica: cuando se retira una columna, hay que buscarla también
-- dentro de las funciones y los disparadores, no sólo en las tablas y el código.
--
-- ── Qué cambia ──────────────────────────────────────────────────────────────
--
-- Se quita el camino de compatibilidad hacia `worker_id` —ya no hay a qué ser
-- compatible— y las tres cláusulas `OR a.worker_id = NEW.worker_id` de las
-- consultas de horas y descanso. Todo lo demás queda igual: los topes diarios y
-- semanales, el de horas extra y el de descanso mínimo siguen exactamente como
-- estaban, porque funcionan y son la razón por la que esta función existe.

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
    RAISE EXCEPTION 'Excede las horas diarias del contrato (%.2f > %.2f).',
      v_daily_hours, v_contract.max_hours_per_day;
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
    RAISE EXCEPTION 'Excede las horas semanales del contrato (%.2f > %.2f).',
      v_weekly_hours, v_contract.max_hours_per_week;
  END IF;

  -- ── Horas extra ───────────────────────────────────────────────────────────

  v_overtime_hours := GREATEST(0, v_weekly_hours - v_contract.base_hours_per_week);
  IF NOT v_contract.overtime_allowed AND v_overtime_hours > 0 THEN
    RAISE EXCEPTION 'El contrato no permite horas extra.';
  END IF;

  IF v_overtime_hours > v_contract.overtime_cap_hours_per_week THEN
    RAISE EXCEPTION 'Excede el tope de horas extra (%.2f > %.2f).',
      v_overtime_hours, v_contract.overtime_cap_hours_per_week;
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
      RAISE EXCEPTION 'No se respeta el descanso mínimo (%.2f h < %.2f h).',
        v_rest_hours, v_contract.minimum_rest_hours;
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
      RAISE EXCEPTION 'No se respeta el descanso mínimo (%.2f h < %.2f h).',
        v_rest_hours, v_contract.minimum_rest_hours;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_worker_assignment_compliance() IS
  'Topes de jornada por contrato. Cuenta las horas del TURNO, no las trabajadas, así que en la práctica una persona admite una asignación por día. Se limpió la referencia a worker_id, que quedó rota cuando se retiró la tabla workers (2026-08-02) y hacía fallar todo insert.';

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Que la función ya no mencione la columna retirada. `pg_get_functiondef`
-- devuelve el cuerpo tal como quedó, así que esto verifica el hecho y no la
-- intención.

DO $$
DECLARE cuerpo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO cuerpo
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'validate_worker_assignment_compliance';

  IF cuerpo IS NULL THEN
    RAISE EXCEPTION 'No se encontró la función. Se aborta.';
  END IF;

  IF cuerpo ILIKE '%worker_id%' OR cuerpo ILIKE '%worker_legacy_id%' THEN
    RAISE EXCEPTION 'La función sigue mencionando una columna retirada. Se aborta.';
  END IF;

  RAISE NOTICE 'validate_worker_assignment_compliance ya no referencia worker_id.';
END $$;

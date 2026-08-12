-- La nómina y el resolvedor de turnos también citaban `worker_id`.
--
-- El disparador de cumplimiento no era el único. Al preguntarle a la base qué
-- funciones seguían mencionando columnas retiradas —en vez de suponerlo—
-- aparecieron tres más:
--
--   resolve_assignment_employee   disparador sobre `worker_assignments`
--   calculate_monthly_payroll     el RPC que calcula la nómina del mes
--   is_own_worker_record          ayudante de RLS sobre la tabla `workers`
--
-- El primero habría tumbado la siguiente corrida de la siembra exactamente
-- igual que el anterior: son dos disparadores sobre la misma tabla y arreglé
-- uno solo. El segundo es peor de otra manera — nadie corre la nómina todos los
-- días, así que habría fallado el día de pago, sin relación aparente con la
-- migración que la rompió nueve días antes.
--
-- ── Por qué aparecieron recién ahora ────────────────────────────────────────
--
-- `DROP COLUMN` no valida el cuerpo de las funciones plpgsql: Postgres revisa
-- el SQL de una función cuando la EJECUTA. Mientras nadie inserte un turno ni
-- liquide un sueldo, la referencia rota es texto inerte que no rompe ningún
-- despliegue, ninguna prueba y ningún tipo.
--
-- La búsqueda que las encontró vale más que el arreglo, así que queda escrita:
--
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND pg_get_functiondef(p.oid) ILIKE '%columna_retirada%';
--
-- Debería correr como parte de cualquier retiro de columna, junto al grep del
-- código. Es la mitad del sistema que un grep de TypeScript no ve.

-- ── 1. resolve_assignment_employee ──────────────────────────────────────────
-- Su único trabajo era traducir `worker_id` a `employee_id`. No queda nada que
-- traducir: `employee_id` es la identidad y el disparador de cumplimiento ya
-- rechaza la asignación que llegue sin ella. Se retira entero en vez de
-- dejarlo como una función vacía que alguien tenga que entender en dos años.

DROP TRIGGER IF EXISTS trg_resolve_assignment_employee ON public.worker_assignments;
DROP FUNCTION IF EXISTS public.resolve_assignment_employee() CASCADE;

-- ── 2. is_own_worker_record ─────────────────────────────────────────────────
-- Ayudante de RLS que consultaba `public.workers`, tabla que ya no existe.
-- Ninguna política lo usa hoy —si alguna lo hiciera, esas consultas estarían
-- fallando— así que se retira con el resto del puente.

DROP FUNCTION IF EXISTS public.is_own_worker_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_own_worker_record() CASCADE;

-- ── 3. calculate_monthly_payroll ────────────────────────────────────────────
-- Se recrea igual salvo el LEFT JOIN que resolvía el empleado desde el
-- `worker_id` del turno. Sin esa muleta, `wa.employee_id` es la única fuente —
-- que es lo que la tabla viene diciendo desde que se retiró `workers`.

-- Harden monthly payroll RPC: avoid exceptions when compensation is missing
-- and keep return shape/signature unchanged.

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

GRANT EXECUTE ON FUNCTION public.calculate_monthly_payroll(INTEGER, INTEGER, UUID) TO authenticated;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Que no quede NINGUNA función del esquema citando las columnas retiradas.

DO $verifica$
DECLARE sobran text := '';
        r record;
BEGIN
  FOR r IN
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (pg_get_functiondef(p.oid) ILIKE '%worker_legacy_id%'
            OR pg_get_functiondef(p.oid) ~* '(NEW|OLD|wa|a)\.worker_id'
            OR pg_get_functiondef(p.oid) ILIKE '%public.workers%'
            OR pg_get_functiondef(p.oid) ILIKE '%public.workstations%')
  LOOP
    sobran := sobran || r.proname || ' ';
  END LOOP;

  IF sobran <> '' THEN
    RAISE EXCEPTION 'Siguen citando columnas retiradas: %. Se aborta.', sobran;
  END IF;

  RAISE NOTICE 'Ninguna función cita ya worker_id, worker_legacy_id, workers ni workstations.';
END $verifica$;

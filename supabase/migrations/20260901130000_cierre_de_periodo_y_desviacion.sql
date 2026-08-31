-- Cierre de período: cuánto se desvió el motor de costeo de lo real, medido
-- solo, sin que nadie tenga que acordarse de tipear tres trabajos a mano.
--
-- `/analitica/calibracion` (CalibracionMotor.tsx) ya hace esta pregunta, pero
-- a mano: el supervisor escribe tres trabajos que ya conoce y compara contra
-- lo que el motor hubiera predicho. Sirve como banco de pruebas, pero depende
-- de que alguien se siente a hacerlo. Esta tabla es la misma pregunta,
-- contestada sola, con datos reales: para cada OT que se completó en el mes,
-- `ot_cost_summary` (ver 20260628130000_cost_ledger.sql) ya sabe el estimado
-- y el real -- acá sólo se suma por período y se deja escrita la foto.
CREATE TABLE IF NOT EXISTS public.cost_variance_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  ot_count         INTEGER NOT NULL DEFAULT 0,
  total_revenue    NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_estimated  NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_actual     NUMERIC(16,2) NOT NULL DEFAULT 0,
  variance_pct     NUMERIC(6,2),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);

COMMENT ON TABLE public.cost_variance_snapshots IS
  'Una fila por período (mes calendario): cuánto costo estimaron las OT completadas en ese
   mes contra cuánto costaron de verdad, sumado desde ot_cost_summary. Alimenta el panel de
   "desvío real" en /analitica/calibracion, al lado del banco de pruebas manual.';

ALTER TABLE public.cost_variance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_variance_snapshots_select_management ON public.cost_variance_snapshots;
CREATE POLICY cost_variance_snapshots_select_management ON public.cost_variance_snapshots
  FOR SELECT TO authenticated USING (true);

-- La foto de un período: todas las OT completadas entre p_start y p_end
-- (inclusive), sumadas desde ot_cost_summary. Idempotente por diseño —
-- UPSERT sobre (period_start, period_end) — así que correrla dos veces por
-- el mismo mes (el cierre real y un recálculo manual después de una
-- corrección) deja una sola fila, actualizada.
CREATE OR REPLACE FUNCTION public.compute_cost_variance_snapshot(
  p_start DATE,
  p_end   DATE
)
RETURNS public.cost_variance_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cost_variance_snapshots;
BEGIN
  WITH periodo AS (
    SELECT cs.*
    FROM public.ot_cost_summary cs
    JOIN public.ots o ON o.id = cs.ot_id
    WHERE o.status = 'completed'
      AND o.completed_at::date BETWEEN p_start AND p_end
  )
  INSERT INTO public.cost_variance_snapshots
    (period_start, period_end, ot_count, total_revenue, total_estimated, total_actual, variance_pct, computed_at)
  SELECT
    p_start, p_end,
    COUNT(*),
    COALESCE(SUM(revenue), 0),
    COALESCE(SUM(estimated_cost), 0),
    COALESCE(SUM(actual_cost), 0),
    CASE WHEN COALESCE(SUM(estimated_cost), 0) > 0
      THEN ROUND(((SUM(actual_cost) - SUM(estimated_cost)) / SUM(estimated_cost)) * 100, 2)
      ELSE NULL
    END,
    now()
  FROM periodo
  ON CONFLICT (period_start, period_end) DO UPDATE SET
    ot_count = EXCLUDED.ot_count,
    total_revenue = EXCLUDED.total_revenue,
    total_estimated = EXCLUDED.total_estimated,
    total_actual = EXCLUDED.total_actual,
    variance_pct = EXCLUDED.variance_pct,
    computed_at = EXCLUDED.computed_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- El cierre del mes que acaba de terminar, corrido todos los días — cerrar
-- "el 1 a las 00:05" es frágil (un solo intento, sin red si la base está
-- ocupada); correrlo a diario y dejar que el UPSERT lo mantenga al día es más
-- simple y no depende de acertarle a una ventana de un minuto una vez al mes.
-- Sólo se agenda si la extensión pg_cron está disponible en este proyecto —
-- no todos los planes de Supabase la traen, y esto no debe romper el resto de
-- la migración si no está.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cost_variance_monthly_close';
  PERFORM cron.schedule(
    'cost_variance_monthly_close',
    '17 3 * * *',
    $CRON$SELECT public.compute_cost_variance_snapshot(date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date);$CRON$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron no está disponible en todos los planes de Supabase. Si esto
  -- falla por lo que sea, el cierre de período queda sin agendar
  -- automáticamente -- pero la tabla y la función de más arriba SÍ quedan
  -- creadas, así que /api/analytics/cost-variance/close puede llamarse a
  -- mano o desde un cron externo mientras tanto.
  RAISE NOTICE 'No se pudo agendar el cierre automático (pg_cron no disponible): %', SQLERRM;
END $$;

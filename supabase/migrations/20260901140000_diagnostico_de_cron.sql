-- Diagnóstico: ¿el cierre de período quedó agendado?
--
-- La migración anterior intenta agendar `pg_cron`, pero se traga el error si
-- la extensión no está disponible en este plan de Supabase (para no tirar
-- abajo la tabla y la función que sí importan). Esta función es la forma de
-- comprobar, desde afuera, si el intento funcionó o si el cierre depende de
-- POST /api/analytics/cost-variance a mano por ahora.
CREATE OR REPLACE FUNCTION public.cron_status()
RETURNS TABLE (extension_installed BOOLEAN, job_scheduled BOOLEAN, schedule TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN QUERY SELECT false, false, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cost_variance_monthly_close'),
    (SELECT j.schedule FROM cron.job j WHERE j.jobname = 'cost_variance_monthly_close');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cron_status() TO authenticated;

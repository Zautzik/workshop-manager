-- El canal en vivo tiene que estar publicado
--
-- `RealtimeProductionContext` se suscribe a `postgres_changes` sobre trece
-- tablas para refrescar las pantallas cuando otro usuario cambia algo. Postgres
-- sólo emite cambios de las tablas que están en la publicación
-- `supabase_realtime`, y esa publicación estaba VACÍA — en la nube y en local
-- (verificado en pg_publication_tables el 2026-11-16).
--
-- O sea que el channel nunca entregó un solo evento. No falla: se suscribe,
-- queda "conectado" y espera para siempre. Cada pantalla se actualizaba sólo
-- para quien hacía el cambio, y los demás veían datos viejos hasta recargar.
--
-- Se publican exactamente las tablas que el channel escucha (TABLE_SCOPE en
-- src/contexts/RealtimeProductionContext.tsx), ni una más: cada tabla publicada
-- hace que Realtime evalúe RLS por suscriptor en cada escritura.
--
-- Realtime respeta RLS y los permisos por columna: un técnico no recibe
-- cambios de `ot_cost_lines` ni las columnas ocultas de `machines` o
-- `employees`. El cliente además no usa el contenido del evento, sólo lo toma
-- como señal para volver a pedir los datos por la ruta de API de siempre.
--
-- Idempotente: agrega sólo lo que falta, y salta las tablas que no existan.

BEGIN;

DO $$
DECLARE
  t        text;
  agregadas text[] := '{}';
  ausentes  text[] := '{}';
  tablas CONSTANT text[] := ARRAY[
    'ots',
    'ot_machine_schedule',
    'worker_assignments',
    'machines',
    'shifts',
    'employees',
    'compensation_rates',
    'leave_requests',
    'employee_incentives',
    'hr_documents',
    'employment_contracts',
    -- El hilo dorado: la pasada cerrada y el costo que produce.
    'ot_stage_reports',
    'ot_cost_lines'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'No existe la publicación supabase_realtime; este proyecto no tiene Realtime habilitado.';
  END IF;

  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      ausentes := ausentes || t;
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      agregadas := agregadas || t;
    END IF;
  END LOOP;

  RAISE NOTICE 'supabase_realtime: % tabla(s) agregada(s): %.',
    COALESCE(array_length(agregadas, 1), 0), array_to_string(agregadas, ', ');
  IF array_length(ausentes, 1) > 0 THEN
    RAISE NOTICE 'Tablas que no existen, se omiten: %.', array_to_string(ausentes, ', ');
  END IF;
END $$;

COMMIT;

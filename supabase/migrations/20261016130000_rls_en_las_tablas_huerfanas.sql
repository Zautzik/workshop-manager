-- RLS en `public.users`, la tabla que ninguna migración conocía
--
-- `check:rls-drift`, en su primera corrida real (2026-10-16), encontró la deriva
-- al revés: SIETE tablas y CUATRO vistas que existen en la base y que ninguna
-- migración crea. Se hicieron a mano o quedaron del andamio original del
-- proyecto, y por eso la migración 20261014120000 no las tocó — esa migración
-- sólo conocía las que estaban en los archivos.
--
-- De las once, diez están protegidas (RLS activo con policies, o sin grant para
-- `anon`). La excepción:
--
--   `public.users` — RLS APAGADO, cero policies, 2 filas, y expone
--   `id, email, created_at, updated_at, name`. O sea dos direcciones de correo
--   legibles por cualquiera que tenga la publishable key, que viaja en el bundle
--   del navegador de un repositorio público.
--
-- La documentación de Supabase no deja lugar a dudas sobre lo que eso significa:
-- «a table in an exposed schema without RLS is readable and writable by any role
-- with a grant on it». Legible Y ESCRIBIBLE.
--
-- ── Parece vestigial, y aun así se cierra en vez de borrarse ───────────────
--
-- Nada de la aplicación la lee: no hay un solo `from('users')` en `src/` ni en
-- `scripts/`, y ninguna migración la menciona. El padrón de personas es
-- `employees`, y los roles están en `user_roles`. Todo indica que quedó del
-- andamio con el que nació el proyecto.
--
-- Activar RLS cierra el agujero hoy, no destruye nada y es reversible con una
-- línea. BORRARLA sería más limpio —y mejor para privacidad, porque son correos
-- de personas— pero es destructivo y hay 2 filas que nadie revisó. Esa es una
-- decisión del dueño, no de esta migración.
--
--   Para borrarla, una vez confirmado que esas 2 filas no le importan a nadie:
--     DROP TABLE public.users;
--
-- Sin policies, a propósito: nadie la lee, así que no hay lectura legítima que
-- habilitar. Si algún día la hay, va por una ruta de API con control de rol.
--
-- Las otras diez huérfanas NO se tocan: ya están protegidas. Lo que sí queda
-- pendiente de ellas es que ninguna migración las describe, así que un
-- `supabase db reset` no las recrea. El dump de esquema sí las tiene, de modo
-- que el respaldo las cubre; reconstruir desde las migraciones, no.
-- `check:rls-drift` las lista en cada corrida para que no se olviden.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';

    EXECUTE $c$
      COMMENT ON TABLE public.users IS
        'Vestigio del andamio original: nada de la aplicacion la lee (el padron es employees y los roles estan en user_roles). RLS activo desde 20261016130000 porque exponia 2 correos a la publishable key. Candidata a DROP una vez revisadas sus filas.'
    $c$;

    RAISE NOTICE 'RLS activado en public.users (sin policies, a proposito).';
  ELSE
    -- No es un error: si ya no está, el agujero tampoco.
    RAISE NOTICE 'public.users no existe; nada que hacer.';
  END IF;
END $$;

COMMIT;

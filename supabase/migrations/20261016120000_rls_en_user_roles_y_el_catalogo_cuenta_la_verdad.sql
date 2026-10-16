-- RLS en user_roles, y el catálogo empieza a contar la verdad sobre RLS
--
-- Dos cosas que salieron del mismo hallazgo.
--
-- ── 1. user_roles era legible por cualquiera ───────────────────────────────
--
-- `check:anon`, al extenderse el 2026-10-16 a los objetos que el navegador lee
-- de verdad, encontró que `user_roles` devuelve sus 4 filas y 6 columnas a la
-- publishable key. Es el mapa de quién es admin: le decía a cualquiera a qué
-- cuentas conviene apuntar. La key viaja en el bundle del navegador y este
-- repositorio es público.
--
-- Lo llamativo es que la migración que crea la tabla (20251028142113) ya dice
-- `ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY`, y su única policy
-- es `FOR SELECT TO authenticated USING (auth.uid() = user_id)`. Con eso, `anon`
-- —que no es `authenticated`— debería ver CERO filas.
--
-- O sea que RLS no está activo en la base pese a que el archivo dice que sí:
-- deriva entre las migraciones y el servidor, confirmada por el dueño («más de
-- una es ficción»). El repositorio trae `scripts/repair-migration-history.sh`,
-- que marca migraciones como aplicadas sin ejecutarlas.
--
-- Esto se puede activar sin romper nada porque el único lector desde el
-- navegador —`useAdminStats`, que contaba los usuarios— pasó a
-- `/api/admin/stats` con service-role en este mismo cambio. De paso se
-- arreglaron tres conteos que ya estaban mal: la tarjeta mostraba «4 usuarios,
-- 0 trabajadores, 0 máquinas» porque employees, machines y jobs ya devolvían
-- cero a `anon`.
--
-- ── 2. El catálogo ahora reporta RLS y security_invoker ────────────────────
--
-- El problema de fondo no es `user_roles`: es que nadie puede saber cuántos
-- casos así quedan. Cada conteo de la auditoría y del plan de remediación sale
-- de PARSEAR archivos .sql, y esta sesión ya desmintió cuatro supuestos de esa
-- forma — `deprecated_worker_fields`, `workstations`,
-- `workers_with_compensation` y `workers_full_profile` están en las migraciones
-- y no en la base.
--
-- `catalogo_para_auditoria()` ya existía para esto mismo: la escribió el chequeo
-- de columnas muertas para dejar de confiar en grep. Se le agregan dos claves,
-- `seguridad` (RLS y cantidad de policies por tabla) y `vistas`
-- (security_invoker), y con eso `scripts/check-rls-drift.mjs` puede comparar lo
-- que las migraciones AFIRMAN contra lo que el servidor TIENE.
--
-- Las claves viejas (`columns`, `functions`) no se tocan, así que
-- `check-dead-function-refs.cjs` sigue andando igual.
--
-- Sigue siendo SECURITY DEFINER con search_path fijo y revocada de PUBLIC: lee
-- el catálogo del sistema, que no es información para cualquiera.

BEGIN;

-- ── 1) RLS en user_roles ───────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Sin policy nueva, a propósito. La que existe (`TO authenticated`) no la ocupa
-- esta aplicación, y la lectura legítima va por service-role desde
-- /api/admin/stats. Agregar una policy permisiva reabriría el agujero.
COMMENT ON TABLE public.user_roles IS
  'Mapa usuario → rol. RLS activo desde 20261016120000: era legible con la publishable key. Se lee por service-role desde /api/admin/stats.';

-- ── 2) El catálogo cuenta RLS y security_invoker ───────────────────────────
CREATE OR REPLACE FUNCTION public.catalogo_para_auditoria()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'columns', (
      SELECT jsonb_object_agg(t.table_name, t.cols)
      FROM (
        SELECT c.table_name, jsonb_agg(c.column_name ORDER BY c.ordinal_position) AS cols
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        GROUP BY c.table_name
      ) t
    ),

    'functions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', f.proname, 'def', f.def)), '[]'::jsonb)
      FROM (
        SELECT p.proname, pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
      ) f
    ),

    -- Estado real de RLS por tabla. `relrowsecurity` es la respuesta a «¿está
    -- activo?» que ningún grep sobre las migraciones puede dar.
    'seguridad', (
      SELECT COALESCE(jsonb_object_agg(s.relname, jsonb_build_object(
        'rls',      s.relrowsecurity,
        'forzado',  s.relforcerowsecurity,
        'policies', s.policies
      )), '{}'::jsonb)
      FROM (
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
      ) s
    ),

    -- `security_invoker` por vista. Una vista sin esa opción corre con los
    -- permisos de quien la creó y pasa por encima de RLS.
    'vistas', (
      SELECT COALESCE(jsonb_object_agg(v.relname, jsonb_build_object(
        'security_invoker', v.invoker
      )), '{}'::jsonb)
      FROM (
        SELECT c.relname,
               COALESCE(
                 (SELECT o.option_value = 'true'
                  FROM pg_options_to_table(c.reloptions) AS o(option_name, option_value)
                  WHERE o.option_name = 'security_invoker'),
                 false
               ) AS invoker
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v'
      ) v
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalogo_para_auditoria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_para_auditoria() TO service_role;

COMMENT ON FUNCTION public.catalogo_para_auditoria() IS
  'Catalogo para auditoria: columns, functions, seguridad (RLS por tabla) y vistas (security_invoker). Lo usan check-dead-function-refs.cjs y check-rls-drift.mjs. Leer las migraciones no es leer la base.';

COMMIT;

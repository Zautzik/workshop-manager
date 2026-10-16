-- El catálogo recupera `triggers` y el filtro de extensiones
--
-- Corrige mi propio error en 20261016120000. Al agregarle a
-- `catalogo_para_auditoria()` las claves `seguridad` y `vistas`, la reemplacé
-- habiendo leído sólo las primeras 22 líneas de su definición. Se perdieron dos
-- cosas que estaban más abajo:
--
--   1. La clave `triggers` ENTERA. `check-dead-function-refs.cjs` la lee en
--      `catalog.triggers[fn.name]`, así que el chequeo se cayó con
--      «Cannot read properties of undefined». Esa clave es el motivo de ser de
--      la migración que la agregó (20260827160000, «un disparador puede colgar
--      de dos tablas»): un campo de `NEW` se acepta si existe en CUALQUIERA de
--      las tablas del disparador, y sin la lista de tablas el chequeo no puede
--      decidir.
--
--   2. El `LEFT JOIN pg_depend ... AND d.objid IS NULL` del bloque
--      `functions`, que excluye las funciones que pertenecen a una extensión.
--      Sin él, el chequeo revisa funciones de extensiones que no son del
--      proyecto — ruido, y posibles hallazgos falsos.
--
-- Es exactamente el accidente que `check:migrations` existe para evitar, y que
-- NOTES.md §7 ya documentaba con otro nombre: «antes de reemplazar una función
-- hay que buscar TODAS las migraciones que la definen». Lo que faltó esta vez no
-- fue buscar las migraciones —era una sola— sino leer la definición completa
-- antes de reescribirla.
--
-- Esta versión es la original íntegra MÁS las dos claves nuevas. Y `pg_temp`
-- queda al final del search_path, como en el resto de las funciones desde
-- 20261014123000.

BEGIN;

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
        LEFT JOIN pg_depend d
          ON d.objid = p.oid AND d.deptype = 'e'
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND d.objid IS NULL
      ) f
    ),

    -- TODAS las tablas de cada disparador, no una. Un campo de `NEW` se acepta
    -- si existe en cualquiera de ellas; sólo el que no existe en ninguna se
    -- puede afirmar roto.
    'triggers', (
      SELECT COALESCE(jsonb_object_agg(t.proname, t.tablas), '{}'::jsonb)
      FROM (
        SELECT p.proname, jsonb_agg(DISTINCT cl.relname) AS tablas
        FROM pg_trigger tg
        JOIN pg_proc p  ON p.oid = tg.tgfoid
        JOIN pg_class cl ON cl.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE NOT tg.tgisinternal AND n.nspname = 'public'
        GROUP BY p.proname
      ) t
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
  'Catalogo para auditoria: columns, functions (sin las de extensiones), triggers, seguridad (RLS por tabla) y vistas (security_invoker). Lo leen check-dead-function-refs.cjs y check-rls-drift.mjs. Leer las migraciones no es leer la base.';

COMMIT;

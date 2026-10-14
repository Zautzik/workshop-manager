-- Las funciones dejan de ser públicas
--
-- Postgres, en su propia documentación de CREATE FUNCTION: «by default,
-- execute privilege is granted to PUBLIC for newly created functions». En 187
-- migraciones se revocó ese default exactamente DOS veces (`split_ot` y
-- `catalogo_para_auditoria`). Las otras ~73 funciones de `public` siguen
-- siendo ejecutables por `anon`, o sea por cualquiera que tenga la publishable
-- key — que viaja en el bundle del navegador, en un repositorio público que
-- nombra el proyecto.
--
-- ── El caso que obliga a hacer esto hoy ─────────────────────────────────────
--
-- `get_employee_cost_timeline` (20260223120000, redefinida en 20260823130000):
--
--   · es SECURITY DEFINER, o sea corre como el dueño y pasa por encima de RLS;
--   · no tiene `SET search_path`;
--   · nunca se le revocó el EXECUTE de PUBLIC;
--   · devuelve, por empleado y por período: base_pay, ot50_pay, ot100_pay,
--     night_differential, weekend_differential, overtime_premium,
--     incentive_pay — la remuneración completa;
--   · se llama DESDE EL NAVEGADOR (`use-financial-queries.ts:448`), como
--     `anon`, y funciona justamente por el grant que nadie revocó.
--
-- O sea: cualquiera con la publishable key puede pedir el sueldo de cualquier
-- empleado pasando su UUID. Las policies de `compensation_rates` que intentan
-- proteger ese dato son irrelevantes — esta función no las consulta.
--
-- Esta migración lo cierra. La pantalla que la usaba pasa por una ruta de API
-- con control de rol en el mismo cambio (`/api/employees/[id]/cost-timeline`);
-- sin ese acompañamiento la pantalla queda rota, así que las dos cosas van
-- juntas o no van.
--
-- ── Qué queda excluido, y por qué ──────────────────────────────────────────
--
-- Tres funciones conservan el grant: `has_role`, `has_role_name` y
-- `can_supervisor_view_employee`. No es descuido. Una policy se evalúa con los
-- permisos del rol que consulta, así que si `anon` lee una tabla cuya policy
-- llama a `has_role` y no tiene EXECUTE, Postgres contesta «permission denied
-- for function» en vez de devolver cero filas. Las tres aparecen en 248 de las
-- 175 policies vivas (hay policies que llaman más de una). Las tres son
-- SECURITY DEFINER con search_path fijo y sólo devuelven un booleano sobre
-- pertenencia a un rol: con `auth.uid()` NULL devuelven false, que es
-- precisamente el comportamiento que hoy existe y que no conviene cambiar en
-- la misma migración que cierra 70 agujeros.
--
-- ── Para revertir ──────────────────────────────────────────────────────────
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   -- y, por función, GRANT EXECUTE ON FUNCTION <sig> TO PUBLIC;
--
-- Se recorre el catálogo en vez de listar 73 firmas a mano: las sobrecargas
-- tienen la misma `proname` y distinta firma, y una lista escrita a mano no
-- sobrevive a la próxima función nueva. `oid::regprocedure` entrega la firma
-- ya escapada.

BEGIN;

-- 1) El default, para todo lo que se cree de acá en adelante.
--    Tomado literal de la guía «Securing your API» de Supabase.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2) Las que ya existen. `ALTER DEFAULT PRIVILEGES` no es retroactivo.
DO $$
DECLARE
  f           record;
  revocadas   int := 0;
  conservadas CONSTANT text[] := ARRAY[
    'has_role',                      -- evaluada dentro de 220 policies vivas
    'has_role_name',                 -- idem, 22
    'can_supervisor_view_employee'   -- idem, 6
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- Las funciones de trigger quedan fuera: no se pueden invocar como RPC
      -- (devuelven `trigger`, PostgREST no las expone), así que revocarles
      -- EXECUTE no cierra ningún acceso — y sí podría afectar el disparo de
      -- los triggers que las usan. Revocar donde no hay nada que ganar es
      -- riesgo sin beneficio.
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND NOT (p.proname = ANY (conservadas))
    ORDER BY p.proname
  LOOP
    -- `PUBLIC` cubre a `anon` y `authenticated`; se nombran igual para que
    -- quede explícito en el diff qué roles pierden el acceso, y porque un
    -- GRANT directo a `anon` (hay varios en las migraciones viejas) no lo
    -- borra el REVOKE a PUBLIC.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    revocadas := revocadas + 1;
  END LOOP;

  RAISE NOTICE
    'EXECUTE revocado a PUBLIC/anon/authenticated en % funciones; % conservadas para evaluar policies.',
    revocadas, array_length(conservadas, 1);
END $$;

-- 3) Las tres que se conservan: se les deja EXECUTE explícito en vez de
--    depender del default de PUBLIC que acabamos de revocar para el futuro.
--    Por el catálogo y no por firma escrita a mano: `has_role` está sobrecargada
--    y acertarle a los tipos de memoria es justo cómo se escribe un GRANT que
--    no aplica a la sobrecarga que importa.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('has_role', 'has_role_name', 'can_supervisor_view_employee')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
END $$;

COMMIT;

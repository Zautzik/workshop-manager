-- Preguntarle al catálogo quién nombra lo borrado
--
-- Cuatro veces ya. El disparador de turnos que seguía buscando `worker_id`; la
-- línea de tiempo de costo que citaba seis columnas muertas; la nómina, que
-- habría fallado el día de pago sin conexión aparente con una migración de nueve
-- días antes; y ahora `split_ot`, que copiaba `current_workstation_id` al
-- fragmento tres semanas y media después de que esa columna dejara de existir.
--
-- Siempre el mismo mecanismo: el cuerpo de una función PL/pgSQL se guarda como
-- TEXTO y sus referencias se resuelven al EJECUTARLA. `DROP COLUMN` no revisa
-- las funciones que la mencionan y no falla. Tampoco falla el despliegue, ni el
-- `tsc`, ni las pruebas, ni ninguna otra consulta. La función queda rota y en
-- silencio hasta que alguien la usa — y quien la usa es siempre una persona
-- trabajando, no un test.
--
-- ── Por qué esto y no la búsqueda a mano ────────────────────────────────────
--
-- NOTES §7 dejó escrita la consulta correcta: preguntarle a `pg_proc` quién
-- menciona la columna que se está por borrar. Funciona, y falló igual, porque
-- una consulta que hay que ACORDARSE de correr no es un control: es un ritual.
-- `check:migrations` ya convirtió en script el otro ritual de ese capítulo. Esto
-- es el que faltaba.
--
-- ── Qué expone y por qué así ────────────────────────────────────────────────
--
-- Devuelve materia prima, no un veredicto: los cuerpos de las funciones, las
-- columnas reales de cada tabla y a qué tabla pertenece cada disparador. El
-- análisis vive en `scripts/check-dead-function-refs.cjs`, en JavaScript, porque
-- ahí se puede leer, corregir y —sobre todo— probar. Un analizador escrito en
-- SQL dentro de una función sería otra función sin pruebas, que es exactamente
-- la clase de cosa que este control existe para vigilar.
--
-- SECURITY DEFINER para poder leer `pg_proc`, y sin permiso para anon ni
-- authenticated: los cuerpos de las funciones son código, y el código de una
-- SECURITY DEFINER es un mapa de lo que hay que atacar. Sólo el rol de servicio.

BEGIN;

CREATE OR REPLACE FUNCTION public.catalogo_para_auditoria()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    -- Las columnas que existen de verdad, por tabla. Es la vara.
    'columns', (
      SELECT jsonb_object_agg(t.table_name, t.cols)
      FROM (
        SELECT c.table_name, jsonb_agg(c.column_name ORDER BY c.ordinal_position) AS cols
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        GROUP BY c.table_name
      ) t
    ),

    -- Las funciones de la casa. Se excluyen las que instalan las extensiones
    -- (pg_trgm y compañía): no son nuestras y su cuerpo no es nuestro problema.
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

    -- A qué tabla está atado cada disparador. Sin esto, `NEW.algo` dentro de una
    -- función de disparador no se puede juzgar: no se sabe contra qué comparar.
    'triggers', (
      SELECT COALESCE(jsonb_object_agg(t.proname, t.tabla), '{}'::jsonb)
      FROM (
        SELECT DISTINCT p.proname, cl.relname AS tabla
        FROM pg_trigger tg
        JOIN pg_proc p  ON p.oid = tg.tgfoid
        JOIN pg_class cl ON cl.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE NOT tg.tgisinternal AND n.nspname = 'public'
      ) t
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalogo_para_auditoria() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.catalogo_para_auditoria() IS
  'Materia prima para check:functions — cuerpos de funciones, columnas reales y disparadores. El análisis vive en scripts/check-dead-function-refs.cjs.';

COMMIT;

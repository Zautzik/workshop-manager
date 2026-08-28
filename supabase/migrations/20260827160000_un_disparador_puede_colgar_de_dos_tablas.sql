-- Un disparador puede colgar de dos tablas
--
-- La primera corrida del control nuevo denunció 44 referencias muertas. Doce
-- eran mentira, y todas de la misma función.
--
-- `mirror_legacy_capture` es UN disparador colgado de DOS tablas —
-- `whatsapp_production_logs` y `whatsapp_warehouse_logs`— que se ramifica por
-- `TG_TABLE_NAME`. Sus `NEW.message_type`, `NEW.elapsed_minutes` y
-- `NEW.inferred_costs` existen sólo en la rama de producción, y son correctas:
-- PL/pgSQL resuelve el acceso a un campo de `NEW` al ejecutar la rama, así que
-- la rama de bodega nunca los toca.
--
-- El catálogo, en cambio, guardaba UNA tabla por función —`jsonb_object_agg`
-- sobre un `DISTINCT`, donde la última gana— así que juzgó los campos de la
-- rama de producción contra la tabla de bodega.
--
-- ── Por qué se arregla en una migración nueva ───────────────────────────────
--
-- La de las 15:00 ya se aplicó. Editarla dejaría el archivo diciendo una cosa y
-- la base teniendo otra, que es exactamente la deriva que este control existe
-- para cazar. El registro se corrige hacia adelante.
--
-- ── Por qué importa más que el propio error ─────────────────────────────────
--
-- Doce falsos positivos de 44 es una tasa del 27%, y un control que se equivoca
-- una de cada cuatro veces no se corrige: se apaga. NOTES §12 ya dejó escrito
-- que la regla de ESLint con cincuenta hallazgos preexistentes tuvo que quedar
-- en `warn` para no volverse ruido. La diferencia es que aquéllos eran
-- verdaderos; éstos no, y un control que denuncia código sano se gana el
-- derecho a ser ignorado la primera vez que alguien lo comprueba.

BEGIN;

CREATE OR REPLACE FUNCTION public.catalogo_para_auditoria()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
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
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalogo_para_auditoria() FROM PUBLIC, anon, authenticated;

COMMIT;

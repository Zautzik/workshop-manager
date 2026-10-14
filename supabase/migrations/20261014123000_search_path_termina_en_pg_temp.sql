-- El search_path de las funciones SECURITY DEFINER termina en pg_temp
--
-- Dos problemas distintos, un solo arreglo.
--
-- ── 1. Cinco funciones SECURITY DEFINER sin search_path ────────────────────
--
--   get_employee_cost_timeline · get_order_labor_margin ·
--   feed_whatsapp_to_real_costs · estimate_ot_hours · sync_purchase_ledger
--
-- La documentación de Postgres: «because a SECURITY DEFINER function is
-- executed with the privileges of the user that owns it, care is needed to
-- ensure that the function cannot be misused. For security, search_path should
-- be set to exclude any schemas writable by untrusted users. This prevents
-- malicious users from creating objects (e.g., tables, functions, and
-- operators) that mask objects intended to be used by the function».
--
-- ── 2. Las otras 45 lo tienen, pero sin pg_temp ────────────────────────────
--
-- 84 funciones usan `SET search_path = public` y 2 `public, pg_catalog`.
-- Ninguna de las 187 migraciones menciona `pg_temp` ni una vez. La misma
-- página de Postgres explica por qué eso no alcanza: «particularly important
-- in this regard is the temporary-table schema, which is searched first by
-- default, and is normally writable by anyone. A secure arrangement can be
-- obtained by forcing the temporary schema to be searched last. To do this,
-- write pg_temp as the last entry in search_path».
--
-- O sea: una función "endurecida" con `search_path = public` sigue buscando
-- primero en `pg_temp`, que cualquiera puede escribir. El endurecimiento
-- estaba a medias en todo el proyecto.
--
-- ── Por qué `public, pg_temp` y no se conserva `pg_catalog` ────────────────
--
-- Las dos que dicen `public, pg_catalog` no pierden nada: Postgres busca
-- `pg_catalog` primero SIEMPRE, esté nombrado o no, y nombrarlo sólo cambia el
-- orden relativo frente a `public`. Lo que importa es que `pg_temp` quede al
-- final, y eso es lo que esta migración garantiza.
--
-- Se recorre `pg_proc` en vez de escribir 50 firmas: las sobrecargas comparten
-- `proname`, y `oid::regprocedure` entrega la firma ya escapada. Es la misma
-- razón por la que `check-dead-function-refs.cjs` le pregunta al catálogo en
-- vez de confiar en un grep.
--
-- No cambia el cuerpo de ninguna función, así que no aparece en
-- `check:migrations` como redefinición — `ALTER FUNCTION ... SET` toca sólo el
-- atributo.

BEGIN;

DO $$
DECLARE
  f        record;
  tocadas  int := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind  = 'f'
      AND p.prosecdef           -- sólo SECURITY DEFINER: son las que corren
                                -- con privilegios ajenos y las que la
                                -- documentación obliga a fijar.
    ORDER BY p.proname
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.sig);
    tocadas := tocadas + 1;
  END LOOP;

  IF tocadas = 0 THEN
    RAISE EXCEPTION
      'Ninguna función SECURITY DEFINER encontrada en public — el supuesto de esta migración está roto.';
  END IF;

  RAISE NOTICE 'search_path fijado en "public, pg_temp" en % funciones SECURITY DEFINER.', tocadas;
END $$;

COMMIT;

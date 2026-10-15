-- Las vistas dejan de mirar por encima de RLS
--
-- Una vista en Postgres corre con los permisos de quien la creó, no de quien
-- la consulta. La documentación de Supabase lo dice sin rodeos: «views bypass
-- RLS by default because they are usually created with the postgres user. This
-- is a feature of Postgres, which automatically creates views with security
-- definer». Y la consecuencia: «a view over a protected table hands out every
-- row its policies were meant to withhold, so a view needs the same attention
-- as a table».
--
-- `security_invoker` no aparece ni una vez en las 187 migraciones anteriores.
-- Hay 26 vistas vivas (la auditoría contó 21; el conteo correcto sale de
-- reproducir CREATE/DROP en orden cronológico). Entre ellas
-- `workers_with_compensation` y `workers_full_profile`, que es exactamente el
-- dato que las policies de `compensation_rates` intentan proteger.
--
-- Este es el agujero REAL de lectura anónima. Las tablas protegidas devuelven
-- cero filas a `anon` porque sus policies cuelgan de `auth.uid()`, que en esta
-- aplicación es siempre NULL (se entra por NextAuth, nunca se obtiene un JWT
-- de Supabase). Las vistas, en cambio, contestan — y contestan todo.
--
-- ── Ninguna vista queda afuera ─────────────────────────────────────────────
--
-- La primera versión de esta migración excluía tres vistas que el navegador
-- leía —`planta_live`, `inventory_items_stock_v`,
-- `inventory_stock_transactions_v`— para no romperlas, y dejaba su activación
-- para después.
--
-- Al volver a barrer aparecieron CUATRO: también
-- `inventory_low_stock_alerts_v`. No había salido en el primer barrido porque
-- se consulta como `.from('inventory_low_stock_alerts_v' as any)`, y el
-- `as any` antes del paréntesis dejó fuera al patrón que buscaba `.from('…')`.
-- O sea que esta migración, como estaba escrita, habría apagado las alertas de
-- quiebre de stock en silencio: la vista deja de contestar, la pantalla muestra
-- cero alertas, y cero alertas se lee como «no falta nada».
--
-- Las cuatro lecturas se movieron a rutas de API con control de rol
-- (`/api/inventory/levels`, `/api/inventory/movements`,
-- `/api/inventory/low-stock`, `/api/planta/live`), así que ya no hay ninguna
-- vista que el navegador lea y esta migración no necesita excepciones. No hay
-- `1B-bis`: esto es todo.
--
-- Se recorre el catálogo en vez de escribir 23 nombres a mano, por la misma
-- razón que `check-dead-function-refs.cjs` le pregunta al catálogo: una lista
-- escrita a mano se desactualiza en la primera vista nueva.

BEGIN;

-- 1) Guardia de versión. `security_invoker` existe desde Postgres 15; en 14 la
--    sintaxis no falla con error claro sino que se ignora o confunde, y una
--    migración de seguridad que "pasó" sin aplicar nada es peor que una que
--    falla.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION
      'security_invoker requiere Postgres 15+; este servidor reporta %. Abortado sin cambios.',
      current_setting('server_version');
  END IF;
END $$;

-- 2) Todas las vistas de `public`. Sin excepciones.
DO $$
DECLARE
  v         record;
  cambiadas int := 0;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
    cambiadas := cambiadas + 1;
  END LOOP;

  RAISE NOTICE 'security_invoker activado en % vistas (todas).', cambiadas;
END $$;

-- 3) Las policies permisivas que quedan vivas, si su tabla sigue existiendo.
--
--    Son las policies con `USING (true)` y sin cláusula `TO`, o sea aplicables
--    a PUBLIC, que incluye `anon`. (La auditoría marcó cinco; `ots` y
--    `worker_assignments` tenían la suya derogada y reemplazada en la migración
--    siguiente, 20251102131546 — esas dos están bien.)
--
--    Se eliminan en vez de re-acotarse a `authenticated`: las tres se leen por
--    service-role, y un rol que esta aplicación nunca ocupa no es una
--    protección, es una policy muerta que el próximo lector creerá activa.
--
--    ── Por qué esto va en un DO y no son tres DROP sueltos ────────────────
--
--    Porque `workstations` YA NO EXISTE: se fusionó en `machines`
--    (20260802120000) y al borrarse la tabla se borraron sus policies con
--    ella. `DROP POLICY IF EXISTS` no protege de eso — el `IF EXISTS` se
--    refiere a la policy, no a la tabla, así que sobre una tabla ausente
--    falla con 42P01 y se lleva la migración entera. La primera corrida murió
--    exactamente ahí.
--
--    El script que reprodujo las policies seguía los `DROP POLICY` pero no los
--    `DROP TABLE`, y por eso contó una policy que ya no estaba. Preguntarle al
--    catálogo si la tabla existe es más corto que mantener esa lista al día.
DO $$
DECLARE
  p         record;
  borradas  int := 0;
  ausentes  text[] := '{}';
  objetivo  CONSTANT text[][] := ARRAY[
    ['workstations',            'Authenticated users can view workstations'],
    ['shifts',                  'Authenticated users can view shifts'],
    ['scheduling_cost_models',  'Authenticated users can view cost models']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(objetivo, 1)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = objetivo[i][1] AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', objetivo[i][2], objetivo[i][1]);
      borradas := borradas + 1;
    ELSE
      ausentes := ausentes || objetivo[i][1];
    END IF;
  END LOOP;

  RAISE NOTICE 'Policies permisivas atendidas en % tabla(s).', borradas;
  IF array_length(ausentes, 1) > 0 THEN
    -- No es un error: una tabla que ya no existe no puede filtrar nada.
    RAISE NOTICE 'Tablas que ya no existen, se omiten: %.', array_to_string(ausentes, ', ');
  END IF;
END $$;

COMMIT;

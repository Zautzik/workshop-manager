-- Las funciones y los costos se cierran de verdad
--
-- Auditoría del 2026-11-13, hecha contra el catálogo vivo (pg_proc, pg_policies,
-- pg_default_acl) y no contra los archivos .sql.
--
-- ── 1. El default que 20261014122000 dejó a medias ─────────────────────────
--
-- Aquella migración hizo `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON
-- FUNCTIONS FROM PUBLIC`. Pero Supabase no entrega EXECUTE sólo por PUBLIC:
-- el default ACL de `postgres` en `public` nombra a `anon` y `authenticated`
-- uno por uno:
--
--   {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- Revocar a PUBLIC no toca esas entradas. Toda función que se CREA (o se
-- recrea: DROP + CREATE, o una restauración desde dump) nace ejecutable por
-- `anon` y `authenticated`. En la base local, restaurada desde dump, eso son 42
-- de 45 funciones — entre ellas la nómina completa, `replace_role_transitions`
-- y `catalogo_para_auditoria`, todas SECURITY DEFINER y sin chequeo de quién
-- llama.
--
-- El navegador recibe un JWT real de Supabase (AuthContext.setSession), así
-- que un técnico o un vendedor es `authenticated` contra PostgREST y puede
-- llamar /rest/v1/rpc/<función> sin pasar por ninguna ruta de API.
--
-- Ninguna de estas funciones se llama desde el navegador: todas las llamadas
-- `.rpc(` del código usan `supabaseAdmin` (service-role).
--
-- ── 2. Lecturas de costo abiertas a cualquier sesión ───────────────────────
--
--   ot_financials            `ot_financials_read`: SELECT TO authenticated
--                            USING (true). 20260801160000 quiso borrarla pero
--                            borró `ot_financials_select`, que no es su nombre.
--   cost_catalog             SELECT USING (auth.uid() IS NOT NULL)
--   ot_cost_lines            idem
--   ot_real_costs            idem
--   cost_variance_snapshots  `..._select_management` con USING (true)
--   machine_cost_entries     `machine_cost_select` con USING (true)
--
-- Las policies permisivas se combinan con OR: mientras exista la abierta, la
-- restrictiva no restringe nada.
--
-- ── 3. Escrituras abiertas que alimentan el costo ──────────────────────────
--
--   purchases, inventory     INSERT/UPDATE/DELETE con auth.uid() IS NOT NULL.
--                            `purchases` alimenta el ledger por
--                            `sync_purchase_ledger`.
--
-- Idempotente. Se puede correr más de una vez.

BEGIN;

-- ── 1) Funciones ───────────────────────────────────────────────────────────

-- 1a) El default, ahora sí con los roles que Supabase nombra explícitamente.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 1b) Las que ya existen.
DO $$
DECLARE
  f           record;
  revocadas   int := 0;
  conservadas CONSTANT text[] := ARRAY[
    'has_role',                      -- se evalúan DENTRO de las policies con
    'has_role_name',                 -- los permisos de quien consulta; sin
    'can_supervisor_view_employee',  -- EXECUTE la tabla contesta 42501.
    'shift_paid_hours'               -- aritmética pura, la usan triggers no-DEFINER
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND NOT (p.proname = ANY (conservadas))
      -- Las funciones de extensiones no son nuestras.
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', f.sig);
    revocadas := revocadas + 1;
  END LOOP;

  RAISE NOTICE 'EXECUTE revocado a PUBLIC/anon/authenticated en % funciones.', revocadas;
END $$;

-- 1c) Las conservadas, con grant explícito (el default ya no las cubre).
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('has_role', 'has_role_name', 'can_supervisor_view_employee', 'shift_paid_hours')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
END $$;

-- ── 2) Lecturas de costo ───────────────────────────────────────────────────

-- ot_financials: la policy correcta (manager OR admin) ya existe. Se borra la
-- abierta por su nombre real, y la que 20260801160000 creyó borrar.
DROP POLICY IF EXISTS "ot_financials_read"   ON public.ot_financials;
DROP POLICY IF EXISTS "ot_financials_select" ON public.ot_financials;

-- cost_catalog: leen y escriben los mismos tres roles. El cotizador del
-- vendedor lee las tarifas por service-role (rate-card.ts), no por acá.
DROP POLICY IF EXISTS "Authenticated can view cost catalog" ON public.cost_catalog;
DROP POLICY IF EXISTS "Ops roles manage cost catalog"       ON public.cost_catalog;
DROP POLICY IF EXISTS "cost_catalog_gestion"                ON public.cost_catalog;
CREATE POLICY "cost_catalog_gestion"
  ON public.cost_catalog FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

-- ot_cost_lines: la policy de gestión (admin/supervisor/manager, FOR ALL) ya
-- cubre la lectura de esos roles. Sólo sobra la abierta.
DROP POLICY IF EXISTS "Authenticated can view cost lines" ON public.ot_cost_lines;

-- ot_real_costs: idem.
DROP POLICY IF EXISTS "Authenticated users can view real costs" ON public.ot_real_costs;

-- cost_variance_snapshots: el nombre decía "management" y el USING decía true.
DROP POLICY IF EXISTS "cost_variance_snapshots_select_management" ON public.cost_variance_snapshots;
CREATE POLICY "cost_variance_snapshots_select_management"
  ON public.cost_variance_snapshots FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- machine_cost_entries: `machine_cost_all` (admin/manager/supervisor) ya cubre
-- la lectura. OJO: use-machines.ts la lee desde el navegador; un técnico deja
-- de ver los costos por máquina, que es justamente lo que se busca.
DROP POLICY IF EXISTS "machine_cost_select" ON public.machine_cost_entries;

-- ── 3) Escrituras que alimentan el costo ───────────────────────────────────
-- Se conserva la lectura; se acota quién escribe.

DROP POLICY IF EXISTS "Allow authenticated users to insert purchases" ON public.purchases;
DROP POLICY IF EXISTS "Allow authenticated users to update purchases" ON public.purchases;
DROP POLICY IF EXISTS "Allow authenticated users to delete purchases" ON public.purchases;
DROP POLICY IF EXISTS "purchases_gestion"                             ON public.purchases;
CREATE POLICY "purchases_gestion"
  ON public.purchases FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

DROP POLICY IF EXISTS "Allow authenticated users to insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_gestion"                             ON public.inventory;
CREATE POLICY "inventory_gestion"
  ON public.inventory FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

COMMIT;

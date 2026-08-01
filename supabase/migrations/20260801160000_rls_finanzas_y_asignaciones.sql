-- P0 de seguridad: dos políticas permisivas que anulan a las restrictivas.
--
-- CORRECCIÓN A LA AUDITORÍA. Primero se dijo que "la nómina viaja al
-- navegador" como si estuviera desprotegida. Es FALSO y conviene dejarlo
-- escrito: `compensation_rates` y `employee_incentives` están bien cerradas —
--   ALL    → admin OR hr_manager
--   SELECT → can_supervisor_view_employee(auth.uid(), employee_id)
-- Un técnico no puede leer sueldos. RLS aguanta. Que el cálculo ocurra en el
-- cliente sigue siendo mejorable (superficie innecesaria, código sin tests),
-- pero no es una filtración.
--
-- El agujero real estaba en otro lado, y es peor.
--
-- 1. ot_financials
-- ----------------
-- Tenía DOS políticas de SELECT: una correcta (manager OR admin) y otra
--   SELECT TO authenticated USING (true)
-- En Postgres las políticas permisivas se combinan con OR: basta que UNA deje
-- pasar. La restrictiva no restringe nada mientras exista la otra. Cualquier
-- usuario autenticado —un técnico del piso— lee la rentabilidad de todas las OT.
--
-- Y peor:
--   UPDATE TO authenticated USING (true)
-- Cualquier usuario autenticado puede REESCRIBIR los costos y el ingreso de
-- cualquier orden. No hay pantalla que lo ofrezca, pero la puerta está abierta
-- y la anon key va en el bundle del navegador.
--
-- 2. worker_assignments
-- ---------------------
--   SELECT TO public USING (true)
-- `public` incluye al rol anónimo. Verificado con la anon key SIN sesión: se
-- leen las 56 filas. Quién trabajó, en qué puesto y qué día es información de
-- personal, y hoy la sirve cualquiera que tenga la URL del proyecto.

-- ── ot_financials: cerrar lectura y escritura ───────────────────────────────
DROP POLICY IF EXISTS "ot_financials_select" ON public.ot_financials;
DROP POLICY IF EXISTS "ot_financials_update" ON public.ot_financials;
DROP POLICY IF EXISTS "ot_financials_insert" ON public.ot_financials;
DROP POLICY IF EXISTS "ot_financials_delete" ON public.ot_financials;

-- La política correcta ("Managers and admins can view OT financials") ya existe
-- y se conserva. Sólo se agrega la de escritura, que faltaba acotar.
DO $$ BEGIN
  CREATE POLICY "Sólo manager o admin escriben finanzas de OT"
    ON public.ot_financials FOR ALL TO authenticated
    USING  (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── worker_assignments: sacar al anónimo ────────────────────────────────────
-- Se mantiene abierto a cualquier usuario CON SESIÓN: el piso necesita ver la
-- asignación del turno y restringirlo más rompería Planta. Lo que se corta es
-- el acceso sin sesión, que no tiene ninguna justificación.
DROP POLICY IF EXISTS "Authenticated users can view worker assignments" ON public.worker_assignments;

DO $$ BEGIN
  CREATE POLICY "Usuarios con sesión ven las asignaciones"
    ON public.worker_assignments FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.ot_financials IS
  'LEGACY. La analítica de rentabilidad todavía la lee, pero ningún endpoint la escribe. Migrar a ot_cost_lines (P1 de la auditoría 2026-08) y recién entonces marcarla de sólo lectura. No agregar dependencias nuevas.';

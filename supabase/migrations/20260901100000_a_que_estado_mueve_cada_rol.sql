-- A qué estado puede mover una OT cada rol, como datos.
--
-- `ROLE_ACCESS` en src/lib/ot-state-machine.ts era un objeto fijo: seis roles,
-- cada uno con su lista de estados destino permitidos. Correcto, pero cerrado
-- — habilitar a un técnico para cerrar directo a `completed` en el turno de
-- noche (sin supervisor en planta) pedía tocar código y desplegar. Esta tabla
-- es la misma información, editable con un INSERT/DELETE.
--
-- Las CINCO compuertas de negocio (ficha completa, visto bueno, desviación de
-- precio, requisitos de compra, cierre de etapa) NO se tocan: siguen viviendo
-- en `validateTransition()`, hardcodeadas a propósito. Configurar quién puede
-- llegar a dónde es una cosa; decidir si el precio se desvió demasiado es
-- otra, y esa segunda cosa necesita revisión de código, no una fila.
CREATE TABLE IF NOT EXISTS public.ot_role_transitions (
  role      TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (role, to_status)
);

COMMENT ON TABLE public.ot_role_transitions IS
  'A qué estados puede mover una OT cada rol. Semántica todo-o-nada: si esta tabla tiene
   alguna fila, ES el mapa completo (un rol sin fila acá no puede mover a ningún estado); si
   está vacía, la app usa el default hardcodeado en ot-state-machine.ts como red de
   seguridad. Ver loadRoleAccess() en src/lib/transition-rules.ts.';

ALTER TABLE public.ot_role_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_role_transitions_select_authenticated ON public.ot_role_transitions;
CREATE POLICY ot_role_transitions_select_authenticated ON public.ot_role_transitions
  FOR SELECT TO authenticated USING (true);

-- Seed: exactamente el ROLE_ACCESS que ya regía en código, fila por fila. La
-- tabla arranca idéntica a lo que ya pasaba; nada cambia hasta que alguien la
-- edite a propósito.
INSERT INTO public.ot_role_transitions (role, to_status) VALUES
  -- admin y supervisor: cualquier estado.
  ('admin', 'pre_press'), ('admin', 'visto_bueno'), ('admin', 'paper_purchase'),
  ('admin', 'in_storage'), ('admin', 'guillotine_first_cut'), ('admin', 'offset_printing'),
  ('admin', 'digital_printing'), ('admin', 'die_cutting'), ('admin', 'guillotine_final_cut'),
  ('admin', 'workshop'), ('admin', 'outsourced'), ('admin', 'workshop_revision'),
  ('admin', 'ready_for_delivery'), ('admin', 'in_delivery'), ('admin', 'completed'),
  ('supervisor', 'pre_press'), ('supervisor', 'visto_bueno'), ('supervisor', 'paper_purchase'),
  ('supervisor', 'in_storage'), ('supervisor', 'guillotine_first_cut'), ('supervisor', 'offset_printing'),
  ('supervisor', 'digital_printing'), ('supervisor', 'die_cutting'), ('supervisor', 'guillotine_final_cut'),
  ('supervisor', 'workshop'), ('supervisor', 'outsourced'), ('supervisor', 'workshop_revision'),
  ('supervisor', 'ready_for_delivery'), ('supervisor', 'in_delivery'), ('supervisor', 'completed'),
  -- manager: los hitos comerciales, no el detalle de piso.
  ('manager', 'pre_press'), ('manager', 'visto_bueno'), ('manager', 'ready_for_delivery'),
  ('manager', 'in_delivery'), ('manager', 'completed'),
  -- hr_manager: sólo lo administrativo temprano.
  ('hr_manager', 'pre_press'), ('hr_manager', 'visto_bueno'),
  -- technician: el piso — corte, impresión, troquelado, taller, revisión.
  ('technician', 'guillotine_first_cut'), ('technician', 'offset_printing'),
  ('technician', 'digital_printing'), ('technician', 'die_cutting'),
  ('technician', 'guillotine_final_cut'), ('technician', 'workshop'),
  ('technician', 'outsourced'), ('technician', 'workshop_revision')
  -- vendedor: ninguno — deliberadamente sin filas.
ON CONFLICT (role, to_status) DO NOTHING;

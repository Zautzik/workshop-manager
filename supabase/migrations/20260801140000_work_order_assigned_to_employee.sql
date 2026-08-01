-- `assigned_to` apuntaba a una tabla de usuarios del sistema, no a la gente.
--
-- Por eso las 39 órdenes de mantenimiento tienen `assigned_to` en NULL: no es
-- que nadie se acordara de asignarlas, es que NO SE PODÍA. Los mecánicos del
-- taller no tienen cuenta en la app —0 de 20 empleados activos tienen
-- `user_id`— así que la única gente asignable era la que se sienta en una
-- oficina.
--
-- Es el mismo defecto que tenía `worker_assignments.ot_id`, que apuntaba a
-- `rosters` en vez de a `ots`: la llave foránea apunta a la tabla equivocada y
-- entonces la función nunca pudo haber funcionado, con nadie dándose cuenta
-- porque el resultado es un campo vacío, no un error.
--
-- Mantener una máquina lo hace una PERSONA del taller. No necesita login para
-- que le asignen un trabajo.
--
-- Seguro de repuntar: las 39 filas existentes tienen assigned_to NULL, así que
-- no hay dato que migrar.

ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_assigned_to_fkey;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.maintenance_work_orders.assigned_to IS
  'Quién hace el trabajo: employees.id, no un usuario del sistema. Un mecánico no necesita cuenta en la app para que le asignen una orden.';

CREATE INDEX IF NOT EXISTS idx_work_orders_assigned
  ON public.maintenance_work_orders (assigned_to)
  WHERE assigned_to IS NOT NULL;

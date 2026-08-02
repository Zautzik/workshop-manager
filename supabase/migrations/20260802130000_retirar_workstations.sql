-- Fusionar `workstations` dentro de `machines`. Parte 2 de 2: retira.
--
-- La parte 1 dejó `machines.max_workers` poblado, las 56 asignaciones con
-- `machine_id`, y `planta_live` colgando de `machines` en vez de los puestos.
-- Verificado antes de correr esto: 56 de 56 asignaciones con máquina, y la
-- vista devolviendo 17 filas con los nombres reales de la flota en vez de 15
-- puestos con nombres que mentían.
--
-- Ahora se retira la tabla intermedia para que no puedan volver a divergir. Una
-- sola identidad de equipo en toda la app.

BEGIN;

-- Nadie debería quedar colgando. Si algo apareció entre la parte 1 y ahora, se
-- aborta antes de borrar en vez de arrastrar el problema.
DO $$
DECLARE sin_maquina integer;
BEGIN
  SELECT count(*) INTO sin_maquina
    FROM public.worker_assignments
   WHERE machine_id IS NULL;

  IF sin_maquina > 0 THEN
    RAISE EXCEPTION
      'Hay % asignaciones sin machine_id. Se aborta antes de retirar los puestos.', sin_maquina;
  END IF;
END $$;

-- ── 1. `machine_id` pasa a ser obligatorio ──────────────────────────────────
-- Es la columna que sostiene la asignación de personal; permitir NULL ahí sería
-- dejar la puerta abierta a asignaciones sin equipo.
ALTER TABLE public.worker_assignments
  ALTER COLUMN machine_id SET NOT NULL;

-- ── 2. El marcaje de asistencia también apuntaba al puesto ──────────────────
-- La columna se llama `station_id`, no `workstation_id`, así que no salió en la
-- primera búsqueda; la delató el propio DROP. Son 2 filas.
ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL;

UPDATE public.attendance_events ae
   SET machine_id = ws.machine_id
  FROM public.workstations ws
 WHERE ws.id = ae.station_id
   AND ae.machine_id IS NULL;

ALTER TABLE public.attendance_events DROP COLUMN IF EXISTS station_id;

-- ── 3. Fuera las columnas que apuntaban a la tabla intermedia ───────────────

ALTER TABLE public.worker_assignments DROP COLUMN IF EXISTS workstation_id;

-- `ots.current_workstation_id` estaba a 0 de 2 filas: la OT ya usaba
-- `assigned_machine_id` para lo mismo. Nunca llegó a llevar dato real.
ALTER TABLE public.ots DROP COLUMN IF EXISTS current_workstation_id;

-- El enlace inverso máquina → puesto deja de tener sentido cuando son lo mismo.
ALTER TABLE public.machines DROP COLUMN IF EXISTS workstation_id;

-- ── 4. Fuera la tabla ───────────────────────────────────────────────────────
-- `planta_live` ya se reconstruyó sobre `machines` en la parte 1, así que no
-- queda ninguna vista colgando de aquí.
DROP TABLE IF EXISTS public.workstations;

COMMIT;

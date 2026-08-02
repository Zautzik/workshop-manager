-- Fusionar `workstations` dentro de `machines`. Parte 1 de 2: sólo agrega.
--
-- El taller tenía dos identidades para el mismo fierro. Planta leía
-- `workstations` (15 filas con nombre propio) y Equipos leía `machines` (17).
-- Cada puesto YA apuntaba a una máquina —cero FK huérfanas— pero su nombre
-- contradecía al de la máquina, y ahí es donde el hilo dorado se rompía:
--
--     Planta decía            era en realidad
--     ─────────────────       ───────────────────────
--     Offset Printer 2        Digital Printer
--     Guillotine 1            Guillotine #2      ← desfasado en uno
--     Terminaciones B         Alzadora
--     Terminaciones C         Corchetera
--     Terminaciones D         Hotmelera
--     Terminaciones E         Polilaminadora
--     Bodega y Despacho       Dispatch Vehicle #1
--
-- Un operario asignado a "Guillotine 1" estaba parado frente a la Guillotine #2.
-- El nombre mentía sobre el equipo, que es la peor forma de romper la
-- trazabilidad: todo lo demás cuadra y el dato de fondo es falso.
--
-- Además: la Troqueladora tenía DOS puestos (Die Cutter 1 + Puesto Troquelado),
-- así que su capacidad se contaba dos veces; y Guillotine #3, Dispatch Vehicle
-- #2 y #3 no tenían puesto, así que eran invisibles en Planta.
--
-- Esta migración NO borra nada. Deja la app funcionando con las dos columnas
-- para que el cambio de código se pueda verificar antes de retirar la tabla.

BEGIN;

-- ── 1. La capacidad se muda a la máquina ────────────────────────────────────
-- `max_workers` describe cuánta gente cabe operando el equipo, que es una
-- propiedad del equipo, no de una fila intermedia.

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS max_workers integer;

-- Se toma el MÁXIMO, no la suma: los dos puestos de la Troqueladora son la
-- misma máquina física, y sumarlos (2+2=4) inventaría una capacidad que no
-- existe en el piso.
UPDATE public.machines m
   SET max_workers = sub.cupo
  FROM (
    SELECT machine_id, MAX(max_workers) AS cupo
      FROM public.workstations
     WHERE machine_id IS NOT NULL
     GROUP BY machine_id
  ) sub
 WHERE sub.machine_id = m.id;

-- Las tres máquinas que nunca tuvieron puesto quedan con un cupo por defecto
-- en vez de NULL, para que Planta pueda dibujarlas desde el primer día.
UPDATE public.machines
   SET max_workers = 3
 WHERE max_workers IS NULL;

ALTER TABLE public.machines
  ALTER COLUMN max_workers SET DEFAULT 3,
  ALTER COLUMN max_workers SET NOT NULL;

-- ── 2. Las asignaciones de personal apuntan a la máquina ────────────────────

ALTER TABLE public.worker_assignments
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL;

-- El trigger `validate_worker_assignment_compliance` valida jornada, descanso y
-- contrato, y rechaza cualquier fila cuyo `employee_id` no resuelva. Tres de las
-- 56 asignaciones son anteriores al trigger y no resuelven a ningún empleado, de
-- modo que un UPDATE que las toque revienta con "Assignment requires a valid
-- employee_id" — aunque este backfill no cambie nada de personal.
--
-- Se desactiva sólo para el traspaso estructural. Esas tres filas siguen rotas y
-- hay que arreglarlas aparte; esta migración no las esconde ni las inventa.
ALTER TABLE public.worker_assignments DISABLE TRIGGER validate_worker_assignment_compliance;

UPDATE public.worker_assignments wa
   SET machine_id = ws.machine_id
  FROM public.workstations ws
 WHERE ws.id = wa.workstation_id
   AND wa.machine_id IS NULL;

ALTER TABLE public.worker_assignments ENABLE TRIGGER validate_worker_assignment_compliance;

CREATE INDEX IF NOT EXISTS worker_assignments_machine_id_idx
  ON public.worker_assignments (machine_id);

CREATE INDEX IF NOT EXISTS worker_assignments_machine_date_idx
  ON public.worker_assignments (machine_id, date);

-- Red de seguridad: si alguna asignación se quedó sin máquina, se aborta entero
-- en vez de dejar gente colgando de un puesto que va a desaparecer.
DO $$
DECLARE huerfanas integer;
BEGIN
  SELECT count(*) INTO huerfanas
    FROM public.worker_assignments
   WHERE workstation_id IS NOT NULL AND machine_id IS NULL;

  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'Quedaron % asignaciones sin máquina tras el traspaso. Se aborta.', huerfanas;
  END IF;
END $$;

-- ── 3. planta_live pasa a colgar de machines ────────────────────────────────
-- Antes era `FROM workstations LEFT JOIN machines`, y por eso Planta mostraba
-- 15 puestos en vez de las 17 máquinas. Ahora la flota manda.
--
-- Se conserva `workstation_id` como alias de `machines.id` para que el frontend
-- siga funcionando durante el cambio de código; se retira en la parte 2.

DROP VIEW IF EXISTS public.planta_live;

CREATE VIEW public.planta_live AS
SELECT
  m.id                            AS machine_id,
  m.id                            AS workstation_id,   -- compatibilidad temporal
  m.name                          AS machine_name,
  m.name                          AS workstation_name, -- compatibilidad temporal
  m.type                          AS machine_type,
  m.type                          AS workstation_type, -- compatibilidad temporal
  m.status                        AS machine_status,
  m.status                        AS workstation_status,
  m.max_workers,

  m.brand,
  m.model,
  m.colors,
  m.power_kw,
  m.energy_cost_per_hr,
  m.nominal_speed_sheets_hr,
  m.optimal_speed_sheets_hr,
  m.location,
  m.photo_url,

  (
    SELECT jsonb_build_object(
      'id',           o.id,
      'ot_number',    o.ot_number,
      'client',       o.client_name,
      'product',      o.product_name,
      'status',       o.status,
      'due_date',     o.deadline,
      'priority',     o.priority_level
    )
    FROM public.ots o
    WHERE o.assigned_machine_id = m.id
      AND o.status IN (
        'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
        'guillotine_first_cut', 'offset_printing', 'die_cutting',
        'guillotine_final_cut', 'workshop', 'outsourced',
        'workshop_revision', 'ready_for_delivery', 'in_delivery'
      )
    ORDER BY o.updated_at DESC
    LIMIT 1
  )                               AS active_ot,

  (
    SELECT COUNT(*)
    FROM public.worker_assignments wa
    WHERE wa.machine_id = m.id
      AND wa.date = CURRENT_DATE
  )                               AS workers_today,

  (
    SELECT jsonb_agg(jsonb_build_object(
      'id',    COALESCE(e.id::text, w.id::text),
      'name',  COALESCE(e.full_name, w.name),
      'role',  wa.role
    ) ORDER BY wa.role)
    FROM public.worker_assignments wa
    LEFT JOIN public.employees e ON e.id = COALESCE(wa.employee_id, (
      SELECT emp.id FROM public.employees emp WHERE emp.worker_legacy_id = wa.worker_id LIMIT 1
    ))
    LEFT JOIN public.workers w ON w.id = wa.worker_id
    WHERE wa.machine_id = m.id
      AND wa.date = CURRENT_DATE
  )                               AS workers_assigned,

  (
    SELECT COUNT(*)
    FROM public.machine_supply_requirements msr
    JOIN public.inventory_items ii ON ii.id = msr.inventory_item_id
    LEFT JOIN (
      SELECT lot.item_id, COALESCE(SUM(lot.quantity_available), 0) AS total_available
      FROM public.inventory_lots lot
      GROUP BY lot.item_id
    ) stock ON stock.item_id = ii.id
    WHERE msr.machine_id = m.id
      AND msr.is_critical = true
      AND COALESCE(stock.total_available, 0) <= ii.min_stock
  )                               AS critical_supply_alerts,

  m.created_at,
  m.updated_at

FROM public.machines m
ORDER BY m.name;

GRANT SELECT ON public.planta_live TO authenticated;

COMMIT;

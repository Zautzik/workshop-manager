-- Retirar `workers`. Una sola ficha por persona.
--
-- `workers` tenía 43 filas para 22 personas: cada una estaba DOS veces, con el
-- mismo nombre exacto. "Ñaño" además aparecía con distinta caja ("Ñaño" y
-- "ñaño"), y eso es lo que rompía el enlace por nombre y dejaba 3 asignaciones
-- sin resolver a nadie.
--
-- Se comprobó columna por columna antes de decidir: de los 9 campos que las dos
-- tablas comparten —department y las 8 métricas de desempeño— se compararon 378
-- valores entre personas coincidentes. CERO diferencias, y cero casos donde
-- `workers` tuviera dato y `employees` estuviera vacío. No es una tabla
-- complementaria: es una copia. No hay nada que traspasar.
--
-- `employees` gana por goleada como ficha de referencia: 14 tablas cuelgan de
-- `employee_id` (contratos, sueldos, competencias, permisos, documentos,
-- asistencia) contra 3 de `worker_id`, y de esas 3 dos están vacías. Además
-- `workers` no tiene `status` —no distingue vigente de finiquitado—, ni fecha
-- de ingreso, ni `user_id`, así que nunca podría sostener el inicio de sesión.
--
-- `worker_stats` ya se construye sobre `employees`; no hay que tocarla.

BEGIN;

-- ── 1. Las 3 asignaciones huérfanas ─────────────────────────────────────────
-- Las tres son del 20 de febrero de 2026 y son de "Ñaño", que SÍ tiene ficha de
-- empleado (finiquitado). Dos apuntan a la fila "Ñaño" y una a la "ñaño"; son la
-- misma persona escrita distinto. Se resuelven comparando en minúsculas, que es
-- precisamente la comparación que faltaba: "Ñaño" y "ñaño" sólo difieren en la
-- caja, la eñe es el mismo carácter en ambas. No hace falta `unaccent` —que
-- además no está instalado— para una diferencia que `lower()` ya resuelve.

ALTER TABLE public.worker_assignments DISABLE TRIGGER validate_worker_assignment_compliance;

UPDATE public.worker_assignments wa
   SET employee_id = e.id
  FROM public.workers w
  JOIN public.employees e
    ON lower(btrim(e.full_name)) = lower(btrim(w.name))
 WHERE wa.worker_id = w.id
   AND wa.employee_id IS NULL;

ALTER TABLE public.worker_assignments ENABLE TRIGGER validate_worker_assignment_compliance;

-- Red de seguridad: si algo quedó sin persona, se aborta antes de borrar la
-- tabla que todavía guarda la única pista de quién era.
DO $$
DECLARE sin_persona integer;
BEGIN
  SELECT count(*) INTO sin_persona
    FROM public.worker_assignments
   WHERE employee_id IS NULL;

  IF sin_persona > 0 THEN
    RAISE EXCEPTION
      'Quedan % asignaciones sin employee_id. Se aborta antes de retirar workers.', sin_persona;
  END IF;
END $$;

-- ── 2. `planta_live` deja de necesitar el respaldo por operario ─────────────
-- La vista traía `COALESCE(e.full_name, w.name)`: si la asignación no resolvía
-- a un empleado, caía al nombre del operario. Con `employee_id` ya poblado en
-- las 56 filas ese respaldo no tiene a quién rescatar, y es lo que ataba la
-- vista a la tabla duplicada.

CREATE OR REPLACE VIEW public.planta_live AS
SELECT
  m.id AS machine_id, m.id AS workstation_id,
  m.name AS machine_name, m.name AS workstation_name,
  m.type AS machine_type, m.type AS workstation_type,
  m.status AS machine_status, m.status AS workstation_status,
  m.max_workers,
  m.brand, m.model, m.colors, m.power_kw, m.energy_cost_per_hr,
  m.nominal_speed_sheets_hr, m.optimal_speed_sheets_hr, m.location, m.photo_url,
  (
    SELECT jsonb_build_object(
      'id', o.id, 'ot_number', o.ot_number, 'client', o.client_name,
      'product', o.product_name, 'status', o.status,
      'due_date', o.deadline, 'priority', o.priority_level
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
  ) AS active_ot,
  (
    SELECT COUNT(*) FROM public.worker_assignments wa
     WHERE wa.machine_id = m.id AND wa.date = CURRENT_DATE
  ) AS workers_today,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id::text, 'name', e.full_name, 'role', wa.role
    ) ORDER BY wa.role)
    FROM public.worker_assignments wa
    JOIN public.employees e ON e.id = wa.employee_id
    WHERE wa.machine_id = m.id AND wa.date = CURRENT_DATE
  ) AS workers_assigned,
  (
    SELECT COUNT(*)
    FROM public.machine_supply_requirements msr
    JOIN public.inventory_items ii ON ii.id = msr.inventory_item_id
    LEFT JOIN (
      SELECT lot.item_id, COALESCE(SUM(lot.quantity_available), 0) AS total_available
      FROM public.inventory_lots lot GROUP BY lot.item_id
    ) stock ON stock.item_id = ii.id
    WHERE msr.machine_id = m.id
      AND msr.is_critical = true
      AND COALESCE(stock.total_available, 0) <= ii.min_stock
  ) AS critical_supply_alerts,
  m.created_at, m.updated_at
FROM public.machines m
ORDER BY m.name;

GRANT SELECT ON public.planta_live TO authenticated;

-- ── 3. Fuera la tabla, y con ella sus políticas ─────────────────────────────
-- CASCADE se lleva las políticas de `workers` y las claves foráneas que
-- apuntaban a ella. Va ANTES de soltar las columnas, porque una política de
-- `workers` referenciaba `worker_assignments.worker_id` y bloqueaba el DROP.
DROP TABLE IF EXISTS public.workers CASCADE;

-- ── 4. Fuera las columnas que apuntaban a la tabla duplicada ────────────────
-- `task_logs` y `roster_workers` tienen 0 filas, así que no hay nada que
-- traspasar en ellas.

ALTER TABLE public.worker_assignments DROP COLUMN IF EXISTS worker_id;
ALTER TABLE public.task_logs          DROP COLUMN IF EXISTS worker_id;
ALTER TABLE public.roster_workers     DROP COLUMN IF EXISTS worker_id;

-- `worker_legacy_id` sólo existía para tender el puente entre las dos tablas.
-- Sin la otra orilla, sobra.
ALTER TABLE public.employees DROP COLUMN IF EXISTS worker_legacy_id;

-- ── 5. `employee_id` pasa a ser obligatorio ─────────────────────────────────
-- Una asignación sin persona no significa nada: no acumula horas, no cuesta, y
-- no se le puede acreditar competencia a nadie.
ALTER TABLE public.worker_assignments
  ALTER COLUMN employee_id SET NOT NULL;

COMMIT;

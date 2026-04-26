-- =====================================================
-- Workstations ↔ Machines bidirectional link
-- Makes workstations (Planta slots) point to real
-- machine records so that the Planta view shows the
-- individual machine name, model and live status.
-- =====================================================

-- Add machine_id FK to workstations if not already present
ALTER TABLE public.workstations
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL;

-- Allow the workstation name to auto-derive from its machine
-- (UI will display machine.name when machine_id is set)
CREATE INDEX IF NOT EXISTS idx_workstations_machine_id ON public.workstations(machine_id);

-- ─── View: planta_live ────────────────────────────────
-- Single query that the Planta Integrada view will use.
-- Returns every workstation enriched with its real machine
-- data, today's OT assignment, active workers and
-- current inventory alert count for the machine's supplies.

CREATE OR REPLACE VIEW public.planta_live AS
SELECT
  ws.id                           AS workstation_id,
  ws.name                         AS workstation_name,
  ws.type                         AS workstation_type,
  ws.status                       AS workstation_status,
  ws.max_workers,

  -- Machine identity
  m.id                            AS machine_id,
  COALESCE(m.name, ws.name)       AS machine_name,
  m.brand,
  m.model,
  m.type                          AS machine_type,
  m.status                        AS machine_status,
  m.colors,
  m.power_kw,
  m.energy_cost_per_hr,
  m.nominal_speed_sheets_hr,
  m.optimal_speed_sheets_hr,
  m.location,
  m.photo_url,

  -- Active OT assigned to this workstation's machine (most recently started)
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
        'pre_press',
        'visto_bueno',
        'paper_purchase',
        'in_storage',
        'guillotine_first_cut',
        'offset_printing',
        'die_cutting',
        'guillotine_final_cut',
        'workshop',
        'outsourced',
        'workshop_revision',
        'ready_for_delivery',
        'in_delivery'
      )
    ORDER BY o.updated_at DESC
    LIMIT 1
  )                               AS active_ot,

  -- Count of workers assigned today
  (
    SELECT COUNT(*)
    FROM public.worker_assignments wa
    WHERE wa.workstation_id = ws.id
      AND wa.date = CURRENT_DATE
  )                               AS workers_today,

  -- Assigned workers today (array of names)
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id',    COALESCE(e.id::text, w.id::text),
      'name',  COALESCE(e.full_name, w.full_name),
      'role',  wa.role
    ) ORDER BY wa.role)
    FROM public.worker_assignments wa
    LEFT JOIN public.employees e ON e.id = COALESCE(wa.employee_id, (
      SELECT emp.id FROM public.employees emp WHERE emp.worker_legacy_id = wa.worker_id LIMIT 1
    ))
    LEFT JOIN public.workers w ON w.id = wa.worker_id
    WHERE wa.workstation_id = ws.id
      AND wa.date = CURRENT_DATE
  )                               AS workers_assigned,

  -- Critical supply alerts (items below min_stock for this machine)
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

  ws.created_at,
  ws.updated_at

FROM public.workstations ws
LEFT JOIN public.machines m ON m.id = ws.machine_id
ORDER BY ws.name;

-- Grant read access to authenticated users
GRANT SELECT ON public.planta_live TO authenticated;

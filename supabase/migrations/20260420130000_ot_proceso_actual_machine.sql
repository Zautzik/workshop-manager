-- =============================================================
-- OT "Ordenes en Proceso" — Production Floor Tracking
--
-- Adds two new fields to the ots table so the system can
-- replicate the physical "Ordenes en Proceso" floor report:
--
--   proceso_actual  — Free-text supervisor note describing
--                     the current operation in progress
--                     (e.g. "TROQ/ PEGI PAQ 13.000 ENT").
--
--   assigned_machine_id — FK to the specific physical machine
--                         currently running this OT (distinct
--                         from current_workstation_id which
--                         maps to a logical station type).
-- =============================================================

-- ─── Add proceso_actual text column ──────────────────────────
ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS proceso_actual TEXT;

COMMENT ON COLUMN public.ots.proceso_actual IS
  'Free-text supervisor note for the current production step (e.g. TROQ/PEGI PAQ 13.000 ENT)';

-- ─── Add assigned_machine_id FK → machines ───────────────────
ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS assigned_machine_id UUID
    REFERENCES public.machines(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ots.assigned_machine_id IS
  'Specific physical machine (MAQ) currently processing this OT';

CREATE INDEX IF NOT EXISTS idx_ots_assigned_machine
  ON public.ots(assigned_machine_id)
  WHERE assigned_machine_id IS NOT NULL;

-- ─── Grant supervisors permission to update the new fields ───
-- (Existing RLS on ots already covers supervisor UPDATE; 
--  no new policy needed — the columns inherit row-level access.)

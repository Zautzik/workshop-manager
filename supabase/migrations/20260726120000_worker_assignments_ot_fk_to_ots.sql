-- Re-point worker_assignments.ot_id at the real OT table.
--
-- The column was created in 20251101123823 as:
--     ot_id UUID REFERENCES public.rosters(id) ON DELETE SET NULL
-- but `rosters` is the legacy planning table; the app's orders live in `ots`.
-- PlantaBoard has always written `selectedOT.id` (an ots.id) into this column,
-- so every one of those writes violated the foreign key and the assignment was
-- saved with ot_id = NULL instead.
--
-- Consequence found during the 2026-07 audit: link 3 of the Golden Thread
-- (assignment → OT) looked complete in the schema but had never once held a
-- value — 0 of 4 assignments carried an ot_id. Labour hours therefore could not
-- be attributed to any order, which blocks the whole labour-costing chain.
--
-- Safe to apply: the column is 100% NULL today precisely because no valid write
-- was ever possible, so there is nothing to migrate or reconcile. The guard
-- below still nulls out any row that would not satisfy the new constraint, so
-- the migration cannot fail on unexpected data.

-- 1. Any value that isn't a real OT can't survive the new constraint.
UPDATE public.worker_assignments wa
SET ot_id = NULL
WHERE wa.ot_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.ots o WHERE o.id = wa.ot_id);

-- 2. Swap the constraint.
ALTER TABLE public.worker_assignments
  DROP CONSTRAINT IF EXISTS worker_assignments_ot_id_fkey;

ALTER TABLE public.worker_assignments
  ADD CONSTRAINT worker_assignments_ot_id_fkey
  FOREIGN KEY (ot_id) REFERENCES public.ots(id) ON DELETE SET NULL;

-- 3. Attribution joins assignments by (date, workstation) and then by ot_id;
--    keep that lookup cheap as the roster grows.
CREATE INDEX IF NOT EXISTS idx_worker_assignments_ot_id
  ON public.worker_assignments (ot_id)
  WHERE ot_id IS NOT NULL;

COMMENT ON CONSTRAINT worker_assignments_ot_id_fkey ON public.worker_assignments IS
  'Points at ots(id). Was mistakenly created against the legacy rosters table, which silently forced every assignment ot_id to NULL and broke labour attribution (2026-07 audit).';

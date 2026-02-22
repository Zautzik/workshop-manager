-- Unify employees and workers: move worker-facing metrics to employees and use employee_id

-- -----------------------------------------------------------------------------
-- Add performance metrics to employees (source of truth)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sheets_per_hour INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teamwork_rating INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS overtime_availability BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS attendance_score INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS lateness_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS speed_score INTEGER DEFAULT 75,
  ADD COLUMN IF NOT EXISTS overall_rating INTEGER DEFAULT 75;

UPDATE public.employees e
SET
  sheets_per_hour = COALESCE(e.sheets_per_hour, w.sheets_per_hour, 0),
  teamwork_rating = COALESCE(e.teamwork_rating, w.teamwork_rating, 75),
  overtime_availability = COALESCE(e.overtime_availability, w.overtime_availability, true),
  attendance_score = COALESCE(e.attendance_score, w.attendance_score, 100),
  lateness_minutes = COALESCE(e.lateness_minutes, w.lateness_minutes, 0),
  quality_score = COALESCE(e.quality_score, w.quality_score, 75),
  speed_score = COALESCE(e.speed_score, w.speed_score, 75),
  overall_rating = COALESCE(e.overall_rating, w.overall_rating, 75)
FROM public.workers w
WHERE e.worker_legacy_id = w.id;

-- -----------------------------------------------------------------------------
-- Task logs: add employee_id and backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_logs
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.task_logs
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.task_logs tl
SET employee_id = e.id
FROM public.employees e
WHERE tl.employee_id IS NULL
  AND tl.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_task_logs_employee_id ON public.task_logs(employee_id);

-- -----------------------------------------------------------------------------
-- Roster workers: add employee_id and backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.roster_workers
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.roster_workers
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.roster_workers rw
SET employee_id = e.id
FROM public.employees e
WHERE rw.employee_id IS NULL
  AND rw.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_roster_workers_employee_id ON public.roster_workers(employee_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'roster_workers_employee_unique'
  ) THEN
    CREATE UNIQUE INDEX roster_workers_employee_unique
      ON public.roster_workers(roster_id, employee_id)
      WHERE employee_id IS NOT NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Worker assignments: prefer employee_id and allow worker_id to be nullable
-- -----------------------------------------------------------------------------
ALTER TABLE public.worker_assignments
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.worker_assignments
  ALTER COLUMN worker_id DROP NOT NULL;

UPDATE public.worker_assignments wa
SET employee_id = e.id
FROM public.employees e
WHERE wa.employee_id IS NULL
  AND wa.worker_id = e.worker_legacy_id;

CREATE INDEX IF NOT EXISTS idx_worker_assignments_employee_id
  ON public.worker_assignments(employee_id);

-- -----------------------------------------------------------------------------
-- Worker stats view: switch to employees as source of truth
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.worker_stats AS
SELECT
  e.id,
  e.full_name AS name,
  e.department,
  COUNT(tl.id) AS total_tasks,
  AVG(tl.time_spent_minutes) AS avg_time_minutes,
  AVG(tl.performance_rating) AS avg_rating,
  GREATEST(0, 100 - (AVG(tl.time_spent_minutes) * 0.5))::INTEGER AS efficiency_score,
  e.sheets_per_hour,
  e.teamwork_rating,
  e.overtime_availability,
  e.attendance_score,
  e.lateness_minutes,
  e.quality_score,
  e.speed_score,
  e.overall_rating
FROM public.employees e
LEFT JOIN public.task_logs tl ON e.id = tl.employee_id
GROUP BY
  e.id,
  e.full_name,
  e.department,
  e.sheets_per_hour,
  e.teamwork_rating,
  e.overtime_availability,
  e.attendance_score,
  e.lateness_minutes,
  e.quality_score,
  e.speed_score,
  e.overall_rating;

GRANT SELECT ON public.worker_stats TO authenticated;

-- -----------------------------------------------------------------------------
-- Jobs: add assigned_employee_id when legacy worker assignment exists
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
  ) THEN
    ALTER TABLE public.jobs
      ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name = 'assigned_worker_id'
    ) THEN
      UPDATE public.jobs j
      SET assigned_employee_id = e.id
      FROM public.employees e
      WHERE j.assigned_employee_id IS NULL
        AND j.assigned_worker_id = e.worker_legacy_id;
    END IF;
  END IF;
END $$;

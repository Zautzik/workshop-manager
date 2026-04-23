-- =====================================================
-- Maintenance Programs Module
-- =====================================================
-- Adds support for machine-specific maintenance programs
-- sourced from equipment operator manuals (e.g., Ryobi 524GS).
-- Two complementary views:
--   1. German manual → technical matrix by section & interval
--   2. Japanese manual → numbered weekly operator log (tasks 5-33)
-- =====================================================

-- Frequency type for program tasks
DO $$ BEGIN
  CREATE TYPE public.task_frequency AS ENUM (
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'quarterly',
    'semiannual',
    'annual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Action type for program tasks
DO $$ BEGIN
  CREATE TYPE public.task_action AS ENUM (
    'clean',
    'lubricate',
    'check',
    'replace',
    'adjust',
    'inspect',
    'service',
    'fill',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- Table: maintenance_programs
-- One row per machine model / manual source
-- =====================================================
CREATE TABLE IF NOT EXISTS public.maintenance_programs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  machine_model   TEXT        NOT NULL,
  machine_id      UUID        REFERENCES public.machines(id) ON DELETE SET NULL,
  description     TEXT,
  source_language TEXT        NOT NULL DEFAULT 'es', -- ISO 639-1: 'de', 'ja', 'es'
  manual_source   TEXT,       -- Free-text label, e.g. "Ryobi 524GS German Manual"
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_programs_machine_id
  ON public.maintenance_programs(machine_id);
CREATE INDEX IF NOT EXISTS idx_maint_programs_active
  ON public.maintenance_programs(is_active);

-- =====================================================
-- Table: program_tasks
-- Individual maintenance tasks belonging to a program
-- =====================================================
CREATE TABLE IF NOT EXISTS public.program_tasks (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       UUID           NOT NULL REFERENCES public.maintenance_programs(id) ON DELETE CASCADE,
  task_number      INT,           -- Original numbering from manual (e.g. 5-33 from Japanese log)
  section          TEXT,          -- Machine section grouping (e.g. "Lubricacion central")
  subsection       TEXT,          -- Optional sub-group
  description      TEXT           NOT NULL,
  frequency        task_frequency NOT NULL,
  action_type      task_action    NOT NULL DEFAULT 'check',
  source           TEXT           DEFAULT 'manual', -- 'german_manual' | 'japanese_manual' | 'both'
  estimated_minutes INT           DEFAULT 5,
  notes            TEXT,
  sort_order       INT            NOT NULL DEFAULT 0,
  is_active        BOOLEAN        NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_tasks_program_id
  ON public.program_tasks(program_id);
CREATE INDEX IF NOT EXISTS idx_program_tasks_frequency
  ON public.program_tasks(frequency);
CREATE INDEX IF NOT EXISTS idx_program_tasks_active
  ON public.program_tasks(is_active);

-- =====================================================
-- Table: program_task_logs
-- Operator weekly log — one row per task/day/week
-- Mirrors the Mon-Sun grid from the Japanese log sheet
-- =====================================================
CREATE TABLE IF NOT EXISTS public.program_task_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID        NOT NULL REFERENCES public.program_tasks(id) ON DELETE CASCADE,
  program_id    UUID        NOT NULL REFERENCES public.maintenance_programs(id) ON DELETE CASCADE,
  week_start    DATE        NOT NULL, -- ISO Monday of the week (YYYY-MM-DD)
  day_of_week   SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon … 6=Sun
  completed     BOOLEAN     NOT NULL DEFAULT true,
  completed_by  UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_ptlogs_task_id
  ON public.program_task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_ptlogs_week_start
  ON public.program_task_logs(week_start);
CREATE INDEX IF NOT EXISTS idx_ptlogs_program_week
  ON public.program_task_logs(program_id, week_start);

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE public.maintenance_programs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_task_logs     ENABLE ROW LEVEL SECURITY;

-- Programs: all authenticated users read; all manage
CREATE POLICY "programs_select" ON public.maintenance_programs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "programs_all"    ON public.maintenance_programs
  FOR ALL    TO authenticated USING (true);

-- Tasks: same pattern
CREATE POLICY "ptasks_select" ON public.program_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ptasks_all"    ON public.program_tasks
  FOR ALL    TO authenticated USING (true);

-- Logs: all authenticated operators can manage
CREATE POLICY "ptlogs_all" ON public.program_task_logs
  FOR ALL TO authenticated USING (true);

-- =====================================================
-- updated_at trigger for programs
-- =====================================================
CREATE TRIGGER update_maintenance_programs_updated_at
  BEFORE UPDATE ON public.maintenance_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

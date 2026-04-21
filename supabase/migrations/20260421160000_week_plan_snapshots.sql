-- =============================================================
-- Weekly Plan Snapshots (published planner versions)
--
-- Supports immutable weekly publishing for Plan Semanal.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.week_plan_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   DATE NOT NULL,
  week_end     DATE NOT NULL,
  version      INTEGER NOT NULL CHECK (version > 0),
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  UNIQUE (week_start, version)
);

CREATE INDEX IF NOT EXISTS idx_week_plan_snapshots_week
  ON public.week_plan_snapshots(week_start, status, version DESC);

CREATE TABLE IF NOT EXISTS public.week_plan_snapshot_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id        UUID NOT NULL REFERENCES public.week_plan_snapshots(id) ON DELETE CASCADE,
  machine_id         UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  ot_id              UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  slot_id            UUID REFERENCES public.ot_machine_schedule(id) ON DELETE SET NULL,
  scheduled_date     DATE NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  scheduled_start    TIMESTAMPTZ,
  scheduled_end      TIMESTAMPTZ,
  hours_planned      NUMERIC(8,2),
  ot_number          TEXT,
  client_name        TEXT,
  product_label      TEXT,
  quantity           INTEGER,
  color_front        TEXT,
  color_back         TEXT,
  flag_ord           BOOLEAN NOT NULL DEFAULT FALSE,
  flag_pro           BOOLEAN NOT NULL DEFAULT FALSE,
  flag_vbp           BOOLEAN NOT NULL DEFAULT FALSE,
  flag_plan          BOOLEAN NOT NULL DEFAULT FALSE,
  flag_paper_arrived BOOLEAN NOT NULL DEFAULT FALSE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_week_plan_lines_snapshot
  ON public.week_plan_snapshot_lines(snapshot_id, machine_id, scheduled_date, sort_order);

-- RLS
ALTER TABLE public.week_plan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_plan_snapshot_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view week plan snapshots"
  ON public.week_plan_snapshots FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and supervisors can manage week plan snapshots"
  ON public.week_plan_snapshots FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Authenticated users can view week plan snapshot lines"
  ON public.week_plan_snapshot_lines FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and supervisors can manage week plan snapshot lines"
  ON public.week_plan_snapshot_lines FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

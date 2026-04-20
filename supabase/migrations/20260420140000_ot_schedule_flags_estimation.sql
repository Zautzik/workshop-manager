-- =============================================================
-- OT Production Scheduling — Hoja de Producción support
--
-- 1. Planning flags on ots (ORD/PRO/VBP/PLAN/PAPEL)
-- 2. ot_machine_schedule: Gantt slots per OT per machine
-- 3. estimate_ot_hours(): Tier-1 rule-based + Tier-2 historical RPC
-- =============================================================

-- ─── 1. Planning flags on ots ────────────────────────────────
-- These mirror the checkbox columns on the physical Hoja de Producción.

ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS flag_ord      BOOLEAN NOT NULL DEFAULT FALSE,  -- Order confirmed
  ADD COLUMN IF NOT EXISTS flag_pro      BOOLEAN NOT NULL DEFAULT FALSE,  -- Proof completed
  ADD COLUMN IF NOT EXISTS flag_vbp      BOOLEAN NOT NULL DEFAULT FALSE,  -- Visto Bueno (client approved)
  ADD COLUMN IF NOT EXISTS flag_plan     BOOLEAN NOT NULL DEFAULT FALSE,  -- Scheduled into production plan
  ADD COLUMN IF NOT EXISTS flag_paper_arrived BOOLEAN NOT NULL DEFAULT FALSE; -- Physical paper in warehouse

COMMENT ON COLUMN public.ots.flag_ord              IS 'Order confirmed by sales';
COMMENT ON COLUMN public.ots.flag_pro              IS 'Proof/prepress completed';
COMMENT ON COLUMN public.ots.flag_vbp              IS 'Visto Bueno — client sign-off received';
COMMENT ON COLUMN public.ots.flag_plan             IS 'Scheduled into production plan';
COMMENT ON COLUMN public.ots.flag_paper_arrived    IS 'Physical paper arrived in warehouse — job is runnable';

-- ─── 2. ot_machine_schedule table ───────────────────────────
-- One row per machine run for an OT (an OT may appear on multiple
-- machines across different shifts).

CREATE TABLE IF NOT EXISTS public.ot_machine_schedule (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id              UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  machine_id         UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,

  -- Timing
  scheduled_start    TIMESTAMPTZ,                -- INICIO
  scheduled_end      TIMESTAMPTZ,                -- TÉRMINO
  actual_start       TIMESTAMPTZ,
  actual_end         TIMESTAMPTZ,

  -- Hours
  estimated_hours    NUMERIC(8,2) CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  hours_override     NUMERIC(8,2) CHECK (hours_override  IS NULL OR hours_override  >= 0),
  actual_hours       NUMERIC(8,2) CHECK (actual_hours    IS NULL OR actual_hours    >= 0),

  -- Press sheet specifics (MEDIO A / PLIEGO / TIPO PAPEL)
  sheet_width_cm     NUMERIC(8,2),
  sheet_height_cm    NUMERIC(8,2),
  calc_sheets        INTEGER CHECK (calc_sheets IS NULL OR calc_sheets >= 0),
  paper_type_label   TEXT,   -- Free text: "Couche Brillante 250", "Kraft Liner 250", etc.

  -- Sort order within the machine's day
  sort_order         INTEGER NOT NULL DEFAULT 0,

  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_schedule_ot_id
  ON public.ot_machine_schedule(ot_id);

CREATE INDEX IF NOT EXISTS idx_ot_schedule_machine_date
  ON public.ot_machine_schedule(machine_id, scheduled_start)
  WHERE scheduled_start IS NOT NULL;

-- Keep updated_at current
CREATE OR REPLACE TRIGGER update_ot_machine_schedule_updated_at
BEFORE UPDATE ON public.ot_machine_schedule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.ot_machine_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view schedule"
  ON public.ot_machine_schedule FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Supervisors and admins can manage schedule"
  ON public.ot_machine_schedule FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- ─── 3. estimate_ot_hours() RPC ─────────────────────────────
-- Tier-1: rule-based estimate from job spec constants.
-- Tier-2: historical calibration from ot_machine_schedule.actual_hours.
-- Returns: { estimated_hours, tier1_hours, tier2_hours, confidence }
-- confidence = 'low' (< 5 samples), 'medium' (5-20), 'high' (> 20)

CREATE OR REPLACE FUNCTION public.estimate_ot_hours(
  p_ot_id          UUID,
  p_machine_type   TEXT   DEFAULT NULL  -- override if known; otherwise reads from ots
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_ot              RECORD;
  v_machine_type    TEXT;

  -- Tier-1 constants
  v_base_sph        NUMERIC := 3000;   -- sheets per hour for offset (default)
  v_setup_h         NUMERIC := 0.5;
  v_color_mult      NUMERIC := 1.0;
  v_finish_h        NUMERIC := 0.0;
  v_tier1           NUMERIC;

  -- Tier-2 historical
  v_hist_avg        NUMERIC;
  v_hist_count      INTEGER;
  v_tier2           NUMERIC;
  v_confidence      TEXT;
  v_final           NUMERIC;
BEGIN
  -- Fetch OT spec
  SELECT quantity, color_front, color_back, calc_sheets, calc_print_hours, calc_finish_hours,
         finish_troquelado, finish_plegado, finish_pegado, finish_laminado,
         finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping,
         finish_uv_localizado, finish_numeracion
    INTO v_ot
    FROM public.ots
   WHERE id = p_ot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'OT not found');
  END IF;

  -- Determine machine type
  v_machine_type := COALESCE(p_machine_type, 'offset_printer');

  -- ── Tier-1: rule-based ───────────────────────────────────
  -- Machine speed constants (sheets/hour)
  v_base_sph := CASE v_machine_type
    WHEN 'offset_printer'  THEN 5000
    WHEN 'digital_printer' THEN 1200
    WHEN 'die_cutter'      THEN 3000
    WHEN 'guillotine'      THEN 4000
    WHEN 'manual_workshop' THEN 500
    ELSE 2000
  END;

  -- Color complexity multiplier
  v_color_mult := CASE
    WHEN v_ot.color_front = 'cmyk_pantone' THEN 1.4
    WHEN v_ot.color_front = 'cmyk'         THEN 1.0
    WHEN v_ot.color_front = '3_color'      THEN 0.85
    WHEN v_ot.color_front = '2_color'      THEN 0.70
    WHEN v_ot.color_front = '1_color'      THEN 0.55
    ELSE 0.4
  END;

  -- Setup time (add extra for pantone inks)
  v_setup_h := 0.5 + CASE WHEN v_ot.color_front = 'cmyk_pantone' THEN 0.25 ELSE 0 END;

  -- Finishing hours
  v_finish_h :=
    CASE WHEN v_ot.finish_troquelado    THEN 0.5 ELSE 0 END +
    CASE WHEN v_ot.finish_plegado       THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_pegado        THEN 0.4 ELSE 0 END +
    CASE WHEN v_ot.finish_laminado      THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_barniz        THEN 0.2 ELSE 0 END +
    CASE WHEN v_ot.finish_relieve       THEN 0.4 ELSE 0 END +
    CASE WHEN v_ot.finish_perforado     THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_hot_stamping  THEN 0.5 ELSE 0 END +
    CASE WHEN v_ot.finish_uv_localizado THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_numeracion    THEN 0.4 ELSE 0 END;

  -- Use existing calc_print_hours if set, else derive from sheets
  v_tier1 := COALESCE(
    v_ot.calc_print_hours,
    ROUND(
      v_setup_h
      + (COALESCE(v_ot.calc_sheets, CEIL(v_ot.quantity::NUMERIC / 8)) / v_base_sph) * v_color_mult
      + COALESCE(v_ot.calc_finish_hours, v_finish_h),
      2
    )
  );

  -- ── Tier-2: historical calibration ──────────────────────
  -- Compare against past jobs with same machine type + color mode + similar quantity
  SELECT
    ROUND(AVG(s.actual_hours), 2),
    COUNT(*)
  INTO v_hist_avg, v_hist_count
  FROM public.ot_machine_schedule s
  JOIN public.machines m ON m.id = s.machine_id
  JOIN public.ots o       ON o.id = s.ot_id
  WHERE s.actual_hours IS NOT NULL
    AND m.type::TEXT = v_machine_type
    AND o.color_front  = v_ot.color_front
    AND o.quantity BETWEEN v_ot.quantity * 0.7 AND v_ot.quantity * 1.3;

  v_confidence := CASE
    WHEN v_hist_count >= 20 THEN 'high'
    WHEN v_hist_count >=  5 THEN 'medium'
    ELSE 'low'
  END;

  -- Blend Tier-1 + Tier-2 based on confidence
  v_tier2 := v_hist_avg;
  v_final := CASE
    WHEN v_hist_count >= 20 THEN ROUND(v_tier1 * 0.3 + v_hist_avg * 0.7, 2)
    WHEN v_hist_count >=  5 THEN ROUND(v_tier1 * 0.6 + v_hist_avg * 0.4, 2)
    ELSE v_tier1
  END;

  RETURN jsonb_build_object(
    'estimated_hours', v_final,
    'tier1_hours',     v_tier1,
    'tier2_hours',     v_tier2,
    'sample_count',    v_hist_count,
    'confidence',      v_confidence
  );
END;
$$;

COMMENT ON FUNCTION public.estimate_ot_hours IS
  'Tier-1 rule-based + Tier-2 historical estimate for production hours.
   Returns estimated_hours, tier1_hours, tier2_hours, confidence (low/medium/high).';

-- Grant execute to authenticated users (read-only estimation, no data mutation)
GRANT EXECUTE ON FUNCTION public.estimate_ot_hours TO authenticated;

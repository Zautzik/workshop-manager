-- =============================================================
-- WhatsApp Production Tracking — Database Schema
--
-- Stores operator messages, parsed data, inferred costs,
-- and supervisor review workflow.
-- =============================================================

-- ─── Review status enum ──────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_review_status') THEN
    CREATE TYPE public.whatsapp_review_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'needs_revision',
      'auto_approved'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_message_type') THEN
    CREATE TYPE public.whatsapp_message_type AS ENUM (
      'start',
      'end',
      'update',
      'unknown'
    );
  END IF;
END $$;

-- ─── Main WhatsApp Production Logs table ─────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OT reference
  ot_number TEXT NOT NULL,
  ot_id UUID REFERENCES public.ots(id) ON DELETE SET NULL,

  -- Operator info
  operator_phone TEXT NOT NULL,
  operator_name TEXT,
  operator_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,

  -- Message data
  message_type public.whatsapp_message_type NOT NULL DEFAULT 'unknown',
  raw_message TEXT NOT NULL,
  message_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Parsed production data (JSON for flexibility)
  parsed_data JSONB,
  inferred_costs JSONB,

  -- Session linking (end → start)
  start_log_id UUID REFERENCES public.whatsapp_production_logs(id) ON DELETE SET NULL,
  elapsed_minutes NUMERIC(10,2),

  -- Supervisor review workflow
  review_status public.whatsapp_review_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,

  -- Supervisor corrections
  corrected_data JSONB,
  corrected_costs JSONB,

  -- System integration
  fed_to_system BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wa_logs_ot_number
  ON public.whatsapp_production_logs(ot_number);

CREATE INDEX IF NOT EXISTS idx_wa_logs_ot_id
  ON public.whatsapp_production_logs(ot_id);

CREATE INDEX IF NOT EXISTS idx_wa_logs_operator_phone
  ON public.whatsapp_production_logs(operator_phone);

CREATE INDEX IF NOT EXISTS idx_wa_logs_review_status
  ON public.whatsapp_production_logs(review_status);

CREATE INDEX IF NOT EXISTS idx_wa_logs_message_type
  ON public.whatsapp_production_logs(message_type);

CREATE INDEX IF NOT EXISTS idx_wa_logs_created_at
  ON public.whatsapp_production_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_logs_start_log
  ON public.whatsapp_production_logs(start_log_id)
  WHERE start_log_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_production_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view logs
DROP POLICY IF EXISTS "Authenticated users can view WA logs" ON public.whatsapp_production_logs;
CREATE POLICY "Authenticated users can view WA logs"
ON public.whatsapp_production_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Supervisors, admins, managers can manage logs
DROP POLICY IF EXISTS "Supervisors can manage WA logs" ON public.whatsapp_production_logs;
CREATE POLICY "Supervisors can manage WA logs"
ON public.whatsapp_production_logs FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- ─── Updated at trigger ──────────────────────────────────────

DROP TRIGGER IF EXISTS update_wa_logs_updated_at ON public.whatsapp_production_logs;
CREATE TRIGGER update_wa_logs_updated_at
BEFORE UPDATE ON public.whatsapp_production_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ─── View: Active sessions (started but not ended) ──────────

CREATE OR REPLACE VIEW public.whatsapp_active_sessions AS
SELECT
  s.id as start_id,
  s.ot_number,
  s.operator_phone,
  s.operator_name,
  s.operator_employee_id,
  s.message_timestamp as started_at,
  EXTRACT(EPOCH FROM (now() - s.message_timestamp)) / 60 as minutes_elapsed,
  s.ot_id
FROM public.whatsapp_production_logs s
WHERE s.message_type = 'start'
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_production_logs e
    WHERE e.start_log_id = s.id
      AND e.message_type = 'end'
  )
ORDER BY s.message_timestamp DESC;

-- ─── View: Pending reviews for supervisors ───────────────────

CREATE OR REPLACE VIEW public.whatsapp_pending_reviews AS
SELECT
  e.id,
  e.ot_number,
  e.ot_id,
  e.operator_phone,
  e.operator_name,
  e.operator_employee_id,
  e.raw_message,
  e.message_timestamp,
  e.parsed_data,
  e.inferred_costs,
  e.start_log_id,
  e.elapsed_minutes,
  e.review_status,
  e.created_at,
  s.raw_message as start_message,
  s.message_timestamp as start_timestamp,
  o.client_name as ot_client,
  o.status as ot_status,
  o.product_name as ot_product
FROM public.whatsapp_production_logs e
LEFT JOIN public.whatsapp_production_logs s ON s.id = e.start_log_id
LEFT JOIN public.ots o ON o.id = e.ot_id
WHERE e.message_type = 'end'
  AND e.review_status = 'pending'
ORDER BY e.created_at DESC;

-- ─── Function: Feed approved data into ot_real_costs ─────────

CREATE OR REPLACE FUNCTION public.feed_whatsapp_to_real_costs(log_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log public.whatsapp_production_logs%ROWTYPE;
  v_costs JSONB;
  v_line JSONB;
BEGIN
  SELECT * INTO v_log FROM public.whatsapp_production_logs WHERE id = log_id;

  IF v_log IS NULL THEN
    RAISE EXCEPTION 'Log not found: %', log_id;
  END IF;

  IF v_log.review_status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'Log must be approved before feeding to system';
  END IF;

  IF v_log.fed_to_system THEN
    RAISE EXCEPTION 'Log already fed to system';
  END IF;

  -- Use corrected costs if available, otherwise inferred
  v_costs := COALESCE(v_log.corrected_costs, v_log.inferred_costs);

  IF v_costs IS NULL OR v_costs->'cost_lines' IS NULL THEN
    RAISE EXCEPTION 'No cost data available';
  END IF;

  -- Insert each cost line into ot_real_costs
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines')
  LOOP
    INSERT INTO public.ot_real_costs (
      ot_id,
      workflow_step,
      operation_code,
      description,
      category,
      quantity,
      unit,
      unit_cost,
      recorded_by,
      notes
    ) VALUES (
      v_log.ot_id,
      'whatsapp_report',
      'WA-' || LEFT(v_log.id::TEXT, 8),
      v_line->>'description',
      COALESCE(v_line->>'category', 'otros'),
      COALESCE((v_line->>'quantity')::NUMERIC, 0),
      COALESCE(v_line->>'unit', 'unit'),
      COALESCE((v_line->>'unit_cost')::NUMERIC, 0),
      v_log.reviewed_by,
      'Registrado vía WhatsApp por ' || COALESCE(v_log.operator_name, v_log.operator_phone)
    );
  END LOOP;

  -- Mark as fed
  UPDATE public.whatsapp_production_logs
  SET fed_to_system = true, updated_at = now()
  WHERE id = log_id;
END;
$$;

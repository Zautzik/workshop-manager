-- Configurable cost model settings for scheduling decisions

CREATE TABLE IF NOT EXISTS public.scheduling_cost_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  cost_weight NUMERIC(6,2) NOT NULL DEFAULT 1,
  rating_weight NUMERIC(6,2) NOT NULL DEFAULT 0,
  skill_weight NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_multiplier_50 NUMERIC(6,2),
  overtime_multiplier_100 NUMERIC(6,2),
  night_shift_multiplier NUMERIC(6,2),
  weekend_multiplier NUMERIC(6,2),
  minimum_hourly_rate NUMERIC(12,2),
  maximum_hourly_rate NUMERIC(12,2),
  rounding_increment NUMERIC(6,2) NOT NULL DEFAULT 0.01,
  prefer_lower_cost BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_cost_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cost models"
  ON public.scheduling_cost_models FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage cost models"
  ON public.scheduling_cost_models FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS scheduling_cost_models_active_unique
  ON public.scheduling_cost_models ((is_active))
  WHERE is_active = true;

DROP TRIGGER IF EXISTS update_scheduling_cost_models_updated_at ON public.scheduling_cost_models;
CREATE TRIGGER update_scheduling_cost_models_updated_at
  BEFORE UPDATE ON public.scheduling_cost_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scheduling_cost_models (name)
SELECT 'Default Cost Model'
WHERE NOT EXISTS (
  SELECT 1 FROM public.scheduling_cost_models WHERE is_active = true
);

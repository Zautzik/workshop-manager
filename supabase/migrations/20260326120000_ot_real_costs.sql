-- ─── OT Real Costs (actual costs logged at each workflow step) ──────
-- Mirrors ot_operations (budgeted) but tracks what really happened

CREATE TABLE IF NOT EXISTS public.ot_real_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  -- Which workflow step this cost was recorded at
  workflow_step TEXT NOT NULL,  -- e.g. 'pre_press', 'offset_printing', etc.
  -- Operation reference (matches ot_operations.name for comparison)
  operation_code TEXT NOT NULL, -- e.g. '00001', '00005'
  description TEXT NOT NULL,   -- e.g. 'Sustrato', 'Impresión Offset'
  category TEXT NOT NULL DEFAULT 'otros', -- materiales, impresion, terminaciones, tercerizado, otros
  -- Cost details
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'unit',
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
  -- Who and when
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_real_costs_ot_id ON public.ot_real_costs(ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_real_costs_step ON public.ot_real_costs(ot_id, workflow_step);

-- RLS
ALTER TABLE public.ot_real_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view real costs" ON public.ot_real_costs;
CREATE POLICY "Authenticated users can view real costs"
ON public.ot_real_costs FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors can manage real costs" ON public.ot_real_costs;
CREATE POLICY "Supervisors can manage real costs"
ON public.ot_real_costs FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- Trigger
DROP TRIGGER IF EXISTS update_ot_real_costs_updated_at ON public.ot_real_costs;
CREATE TRIGGER update_ot_real_costs_updated_at
BEFORE UPDATE ON public.ot_real_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

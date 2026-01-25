-- Add detailed cost tracking columns to ot_financials
ALTER TABLE public.ot_financials 
ADD COLUMN IF NOT EXISTS energy_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS outsourcing_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS hours_spent numeric DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.ot_financials.energy_cost IS 'Electricity and power consumption costs';
COMMENT ON COLUMN public.ot_financials.outsourcing_cost IS 'External services and outsourced work costs';
COMMENT ON COLUMN public.ot_financials.hours_spent IS 'Total hours spent on this OT (for time-based cost calculation)';
COMMENT ON COLUMN public.ot_financials.material_cost IS 'Supplies cost including ink, paper, and other materials';
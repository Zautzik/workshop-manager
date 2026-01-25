-- Create table for OT financials
CREATE TABLE public.ot_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  material_cost DECIMAL(10,2) DEFAULT 0,
  labor_cost DECIMAL(10,2) DEFAULT 0,
  machine_cost DECIMAL(10,2) DEFAULT 0,
  overhead_cost DECIMAL(10,2) DEFAULT 0,
  total_cost DECIMAL(10,2) GENERATED ALWAYS AS (material_cost + labor_cost + machine_cost + overhead_cost) STORED,
  revenue DECIMAL(10,2) DEFAULT 0,
  profit DECIMAL(10,2) GENERATED ALWAYS AS (revenue - (material_cost + labor_cost + machine_cost + overhead_cost)) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(ot_id)
);

-- Create table for machine costs
CREATE TABLE public.machine_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  energy_cost DECIMAL(10,2) DEFAULT 0,
  labor_cost DECIMAL(10,2) DEFAULT 0,
  maintenance_cost DECIMAL(10,2) DEFAULT 0,
  spare_parts_cost DECIMAL(10,2) DEFAULT 0,
  total_operating_cost DECIMAL(10,2) GENERATED ALWAYS AS (energy_cost + labor_cost + maintenance_cost + spare_parts_cost) STORED,
  outsourcing_cost DECIMAL(10,2) DEFAULT 0,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(machine_id, month)
);

-- Create table for equipment investment analysis
CREATE TABLE public.equipment_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  equipment_name TEXT NOT NULL,
  purchase_cost DECIMAL(12,2) NOT NULL,
  estimated_annual_savings DECIMAL(10,2) DEFAULT 0,
  estimated_roi_months INTEGER,
  payback_period_months INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN estimated_annual_savings > 0 
      THEN CEIL((purchase_cost / (estimated_annual_savings / 12))::numeric)
      ELSE NULL 
    END
  ) STORED,
  status TEXT DEFAULT 'proposal' CHECK (status IN ('proposal', 'approved', 'rejected', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ot_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_investments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ot_financials
CREATE POLICY "Managers and admins can view OT financials"
ON public.ot_financials
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers and admins can manage OT financials"
ON public.ot_financials
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for machine_costs
CREATE POLICY "Managers and admins can view machine costs"
ON public.machine_costs
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers and admins can manage machine costs"
ON public.machine_costs
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for equipment_investments
CREATE POLICY "Managers and admins can view equipment investments"
ON public.equipment_investments
FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers and admins can manage equipment investments"
ON public.equipment_investments
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_ot_financials_updated_at
BEFORE UPDATE ON public.ot_financials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_machine_costs_updated_at
BEFORE UPDATE ON public.machine_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_equipment_investments_updated_at
BEFORE UPDATE ON public.equipment_investments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create OT status enum
CREATE TYPE ot_status AS ENUM (
  'paper_purchase',
  'paper_received', 
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
  'completed'
);

-- Create OTs (Orden de Trabajo) table
CREATE TABLE public.ots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ot_number TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  status ot_status NOT NULL DEFAULT 'paper_purchase',
  current_workstation_id UUID REFERENCES public.workstations(id),
  priority INTEGER NOT NULL DEFAULT 1,
  deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for OTs
CREATE POLICY "Authenticated users can view OTs"
ON public.ots
FOR SELECT
USING (true);

CREATE POLICY "Supervisors can manage OTs"
ON public.ots
FOR ALL
USING (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Update workstations to set correct max_workers based on type
UPDATE public.workstations 
SET max_workers = CASE 
  WHEN type = 'offset_printer' THEN 3
  WHEN type = 'guillotine' THEN 1
  WHEN type = 'die_cutter' THEN 2
  WHEN type = 'workshop' THEN 10
  ELSE 6
END;

-- Add die_cutter workstation if not exists
INSERT INTO public.workstations (name, type, max_workers, status)
VALUES ('Die Cutter 1', 'die_cutter', 2, 'active')
ON CONFLICT DO NOTHING;

-- Create trigger for OT updated_at
CREATE TRIGGER update_ots_updated_at
BEFORE UPDATE ON public.ots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
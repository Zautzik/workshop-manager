-- Create workstations table
CREATE TABLE IF NOT EXISTS public.workstations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'offset_printer', 'guillotine', 'other'
  max_workers INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'idle', -- 'idle', 'active', 'maintenance'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create worker_assignments table (links workers to workstations and shifts)
CREATE TABLE IF NOT EXISTS public.worker_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  workstation_id UUID NOT NULL REFERENCES public.workstations(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  ot_id UUID REFERENCES public.rosters(id) ON DELETE SET NULL,
  role TEXT NOT NULL, -- 'head', 'assistant', 'operator'
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add performance metrics to workers table
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS sheets_per_hour INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS teamwork_rating INTEGER DEFAULT 75,
ADD COLUMN IF NOT EXISTS overtime_availability BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS attendance_score INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS lateness_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 75,
ADD COLUMN IF NOT EXISTS speed_score INTEGER DEFAULT 75,
ADD COLUMN IF NOT EXISTS overall_rating INTEGER DEFAULT 75;

-- Enable RLS
ALTER TABLE public.workstations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workstations
CREATE POLICY "Authenticated users can view workstations"
  ON public.workstations FOR SELECT
  USING (true);

CREATE POLICY "Admins and supervisors can manage workstations"
  ON public.workstations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- RLS Policies for shifts
CREATE POLICY "Authenticated users can view shifts"
  ON public.shifts FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage shifts"
  ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for worker_assignments
CREATE POLICY "Authenticated users can view worker assignments"
  ON public.worker_assignments FOR SELECT
  USING (true);

CREATE POLICY "Supervisors can manage worker assignments"
  ON public.worker_assignments FOR ALL
  USING (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Insert default shifts
INSERT INTO public.shifts (name, start_time, end_time) VALUES
  ('Morning Shift', '08:00:00', '16:00:00'),
  ('Afternoon Shift', '16:00:00', '00:00:00')
ON CONFLICT DO NOTHING;

-- Insert default workstations
INSERT INTO public.workstations (name, type, max_workers) VALUES
  ('Offset Printer 1', 'offset_printer', 2),
  ('Offset Printer 2', 'offset_printer', 2),
  ('Guillotine 1', 'guillotine', 1),
  ('Workshop Station 1', 'workshop', 6),
  ('Workshop Station 2', 'workshop', 6),
  ('Workshop Station 3', 'workshop', 6),
  ('Workshop Station 4', 'workshop', 6),
  ('Workshop Station 5', 'workshop', 6)
ON CONFLICT DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_workstations_updated_at
  BEFORE UPDATE ON public.workstations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_worker_assignments_updated_at
  BEFORE UPDATE ON public.worker_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
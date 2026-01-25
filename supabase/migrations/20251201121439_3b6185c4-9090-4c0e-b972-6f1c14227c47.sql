-- Create maintenance checklists table (templates)
CREATE TABLE IF NOT EXISTS public.maintenance_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create maintenance tasks table (items in checklists)
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES public.maintenance_checklists(id) ON DELETE CASCADE NOT NULL,
  task_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 15,
  requires_parts BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create maintenance work orders table (instances of maintenance)
CREATE TABLE IF NOT EXISTS public.maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES public.maintenance_checklists(id) NOT NULL,
  machine_id UUID REFERENCES public.machines(id) NOT NULL,
  ot_id UUID REFERENCES public.ots(id),
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 3,
  scheduled_date TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_time_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create maintenance task completions table (tracking individual task completion)
CREATE TABLE IF NOT EXISTS public.maintenance_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES public.maintenance_work_orders(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.maintenance_tasks(id) NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  time_spent_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_task_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_checklists
CREATE POLICY "Authenticated users can view checklists"
  ON public.maintenance_checklists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and supervisors can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- RLS Policies for maintenance_tasks
CREATE POLICY "Authenticated users can view tasks"
  ON public.maintenance_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and supervisors can manage tasks"
  ON public.maintenance_tasks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- RLS Policies for maintenance_work_orders
CREATE POLICY "All authenticated users can view work orders"
  ON public.maintenance_work_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors and admins can create work orders"
  ON public.maintenance_work_orders FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors, admins, and assigned technicians can update work orders"
  ON public.maintenance_work_orders FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'supervisor'::app_role) OR 
    has_role(auth.uid(), 'technician'::app_role)
  );

-- RLS Policies for maintenance_task_completions
CREATE POLICY "All authenticated users can view completions"
  ON public.maintenance_task_completions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Technicians can insert completions"
  ON public.maintenance_task_completions FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can update completions"
  ON public.maintenance_task_completions FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_maintenance_checklists_updated_at
  BEFORE UPDATE ON public.maintenance_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_maintenance_work_orders_machine ON public.maintenance_work_orders(machine_id);
CREATE INDEX idx_maintenance_work_orders_status ON public.maintenance_work_orders(status);
CREATE INDEX idx_maintenance_work_orders_assigned ON public.maintenance_work_orders(assigned_to);
CREATE INDEX idx_maintenance_work_orders_date ON public.maintenance_work_orders(scheduled_date);
CREATE INDEX idx_maintenance_task_completions_work_order ON public.maintenance_task_completions(work_order_id);
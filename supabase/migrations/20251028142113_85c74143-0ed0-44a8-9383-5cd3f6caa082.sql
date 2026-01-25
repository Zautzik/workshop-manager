-- Create role enum
CREATE TYPE public.app_role AS ENUM ('supervisor', 'manager');

-- Create user_roles table for RBAC
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create machine_type enum
CREATE TYPE public.machine_type AS ENUM (
  'offset_printer',
  'die_cutter',
  'guillotine',
  'digital_printer',
  'pre_press',
  'manual_workshop',
  'delivery'
);

-- Create machine_status enum
CREATE TYPE public.machine_status AS ENUM ('idle', 'running', 'maintenance', 'offline');

-- Create machines table
CREATE TABLE public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type machine_type NOT NULL,
  status machine_status DEFAULT 'idle' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- RLS policies for machines
CREATE POLICY "Authenticated users can view machines"
  ON public.machines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors can update machines"
  ON public.machines FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

-- Create job_status enum
CREATE TYPE public.job_status AS ENUM ('pending', 'in_progress', 'completed', 'delivered');

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  status job_status DEFAULT 'pending' NOT NULL,
  assigned_machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for jobs
CREATE POLICY "Authenticated users can view jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors can insert jobs"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can update jobs"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed machines data
INSERT INTO public.machines (name, type, status) VALUES
  ('Offset Printer 1', 'offset_printer', 'idle'),
  ('Offset Printer 2', 'offset_printer', 'idle'),
  ('Offset Printer 3', 'offset_printer', 'idle'),
  ('Die Cutter', 'die_cutter', 'idle'),
  ('Guillotine 1', 'guillotine', 'idle'),
  ('Guillotine 2', 'guillotine', 'idle'),
  ('Digital Printer', 'digital_printer', 'idle'),
  ('Pre-Press Station', 'pre_press', 'idle'),
  ('Manual Workshop', 'manual_workshop', 'idle'),
  ('Delivery Station', 'delivery', 'idle');
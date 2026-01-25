-- Fix RLS policies for workers table - restrict personal data access
DROP POLICY IF EXISTS "All authenticated users can view workers" ON public.workers;

-- Workers can only view their own data
CREATE POLICY "Workers can view own data"
ON public.workers
FOR SELECT
USING (
  id IN (
    SELECT worker_id FROM public.worker_assignments WHERE worker_id = id
  )
);

-- Supervisors and admins can view all workers
CREATE POLICY "Supervisors and admins can view all workers"
ON public.workers
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role)
);

-- Fix RLS policies for task_logs - restrict to own logs
DROP POLICY IF EXISTS "All authenticated users can view task logs" ON public.task_logs;

-- Create function to check if user is the worker
CREATE OR REPLACE FUNCTION public.is_own_worker_record(_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workers WHERE id = _worker_id
  )
$$;

-- Workers can view their own task logs
CREATE POLICY "Workers can view own task logs"
ON public.task_logs
FOR SELECT
USING (
  worker_id IN (SELECT id FROM public.workers)
);

-- Supervisors and admins can view all task logs
CREATE POLICY "Supervisors and admins can view all task logs"
ON public.task_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role)
);

-- Fix RLS policies for ots table - already has good policies, but let's ensure managers can access
DROP POLICY IF EXISTS "Authenticated users can view OTs" ON public.ots;

CREATE POLICY "Supervisors, managers, and admins can view OTs"
ON public.ots
FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role)
);

-- Add RLS to worker_stats view if it's a table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'worker_stats'
  ) THEN
    ALTER TABLE public.worker_stats ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Only supervisors and admins can view worker stats"
    ON public.worker_stats
    FOR SELECT
    USING (
      has_role(auth.uid(), 'supervisor'::app_role) OR 
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'manager'::app_role)
    );
  END IF;
END $$;
-- Fix search_path for has_role function with CASCADE
DROP FUNCTION IF EXISTS public.has_role(_user_id UUID, _role app_role) CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Recreate the RLS policies that depend on has_role
CREATE POLICY "Supervisors can update machines"
  ON public.machines FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can insert jobs"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can update jobs"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));
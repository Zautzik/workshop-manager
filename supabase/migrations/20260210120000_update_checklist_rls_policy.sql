-- Update RLS policy to allow all authenticated users to manage checklists
DROP POLICY IF EXISTS "Managers and admins can manage checklists" ON public.maintenance_checklists;

CREATE POLICY "All authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

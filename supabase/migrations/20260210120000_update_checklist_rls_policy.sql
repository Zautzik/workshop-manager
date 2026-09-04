-- Update RLS policy to allow all authenticated users to manage checklists
DROP POLICY IF EXISTS "Managers and admins can manage checklists" ON public.maintenance_checklists;
-- 20260207121500 already created a policy with this exact name — plain
-- CREATE POLICY collides with it on a fresh bootstrap ("policy already
-- exists"). DROP IF EXISTS first, same fix as the trigger a few lines up
-- the migration history.
DROP POLICY IF EXISTS "All authenticated users can manage checklists" ON public.maintenance_checklists;

CREATE POLICY "All authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

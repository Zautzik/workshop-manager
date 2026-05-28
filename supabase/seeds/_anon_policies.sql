-- Allow anon role to SELECT from the 4 UI-facing maintenance tables.
-- Needed for NEXT_PUBLIC_DEV_BYPASS=true (anon key, no real auth session).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_work_orders' AND policyname = 'anon_read_work_orders'
  ) THEN
    EXECUTE 'CREATE POLICY anon_read_work_orders ON public.maintenance_work_orders FOR SELECT TO anon USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_checklists' AND policyname = 'anon_read_checklists'
  ) THEN
    EXECUTE 'CREATE POLICY anon_read_checklists ON public.maintenance_checklists FOR SELECT TO anon USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_programs' AND policyname = 'anon_read_programs'
  ) THEN
    EXECUTE 'CREATE POLICY anon_read_programs ON public.maintenance_programs FOR SELECT TO anon USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'program_tasks' AND policyname = 'anon_read_program_tasks'
  ) THEN
    EXECUTE 'CREATE POLICY anon_read_program_tasks ON public.program_tasks FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- Security hardening: maintenance data must never be readable by anon/public.
-- This migration removes any anon-targeted SELECT policy on maintenance tables,
-- including legacy table names referenced in older discussions.

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'maintenance_work_orders',
        'maintenance_checklists',
        'maintenance_programs',
        'program_tasks',
        'maintenance_schedules',
        'maintenance_logs',
        'machine_downtime_logs',
        'maintenance_alerts'
      )
      AND ('anon' = ANY(roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.maintenance_work_orders') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_work_orders FROM anon';
  END IF;

  IF to_regclass('public.maintenance_checklists') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_checklists FROM anon';
  END IF;

  IF to_regclass('public.maintenance_programs') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_programs FROM anon';
  END IF;

  IF to_regclass('public.program_tasks') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.program_tasks FROM anon';
  END IF;

  IF to_regclass('public.maintenance_schedules') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_schedules FROM anon';
  END IF;

  IF to_regclass('public.maintenance_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_logs FROM anon';
  END IF;

  IF to_regclass('public.machine_downtime_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.machine_downtime_logs FROM anon';
  END IF;

  IF to_regclass('public.maintenance_alerts') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.maintenance_alerts FROM anon';
  END IF;
END $$;

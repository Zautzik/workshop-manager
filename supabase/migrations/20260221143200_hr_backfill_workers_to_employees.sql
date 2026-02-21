-- Backfill migration: Transfer existing workers data to HR domain
-- This migration creates employees from existing workers and preserves backward compatibility
-- Run pre-migration checks first: 20260221143150_pre_migration_integrity_check.sql

-- -----------------------------------------------------------------------------
-- Pre-flight validation
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_worker_count INTEGER;
  v_workers_no_name INTEGER;
  v_workers_no_dept INTEGER;
BEGIN
  -- Ensure workers table has data
  SELECT COUNT(*) INTO v_worker_count FROM public.workers;
  
  IF v_worker_count = 0 THEN
    RAISE EXCEPTION 'No workers found in workers table. Aborting migration.';
  END IF;
  
  RAISE NOTICE 'Starting HR domain backfill for % workers...', v_worker_count;
  
  -- Check for data quality issues that will cause failures
  SELECT COUNT(*) INTO v_workers_no_name 
  FROM public.workers 
  WHERE name IS NULL OR TRIM(name) = '';
  
  IF v_workers_no_name > 0 THEN
    RAISE EXCEPTION '% workers have missing names. Fix before migration.', v_workers_no_name;
  END IF;
  
  SELECT COUNT(*) INTO v_workers_no_dept 
  FROM public.workers 
  WHERE department IS NULL OR TRIM(department) = '';
  
  IF v_workers_no_dept > 0 THEN
    RAISE EXCEPTION '% workers have missing departments. Fix before migration.', v_workers_no_dept;
  END IF;
  
  RAISE NOTICE '✓ Pre-flight validation passed';
END $$;

-- -----------------------------------------------------------------------------
-- Phase 1: Populate employees table from workers
-- -----------------------------------------------------------------------------
INSERT INTO public.employees (
  employee_number,
  first_name,
  last_name,
  email,
  phone,
  status,
  date_of_birth,
  hire_date,
  termination_date,
  notes,
  worker_legacy_id,
  created_at,
  updated_at
)
SELECT 
  'EMP-' || LPAD((ROW_NUMBER() OVER (ORDER BY w.created_at))::TEXT, 5, '0') as employee_number,
  -- Split name into first/last (naive approach - adjust if needed)
  SPLIT_PART(w.name, ' ', 1) as first_name,
  CASE 
    WHEN w.name LIKE '% %' THEN SUBSTRING(w.name FROM POSITION(' ' IN w.name) + 1)
    ELSE 'Employee' -- Fallback if single name
  END as last_name,
  LOWER(REPLACE(w.name, ' ', '.')) || '@workshop.local' as email, -- Generate placeholder email
  NULL as phone, -- No phone data in legacy system
  'active'::employee_status as status,
  NULL as date_of_birth, -- Not tracked in legacy system
  w.created_at::DATE as hire_date, -- Use worker creation date as hire date
  NULL as termination_date,
  'Migrated from legacy workers table. Department: ' || w.department as notes,
  w.id as worker_legacy_id,
  w.created_at,
  w.updated_at
FROM public.workers w
ON CONFLICT (worker_legacy_id) DO NOTHING; -- Idempotent: skip if already backfilled

-- Validation: Verify employee creation
DO $$
DECLARE
  v_inserted INTEGER;
  v_expected INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inserted FROM public.employees WHERE worker_legacy_id IS NOT NULL;
  SELECT COUNT(*) INTO v_expected FROM public.workers;
  
  RAISE NOTICE 'Phase 1 complete: % employees created from % workers', v_inserted, v_expected;
  
  IF v_inserted < v_expected THEN
    RAISE WARNING 'Only % of % workers were converted to employees. Check for conflicts.', v_inserted, v_expected;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Phase 2: Create default employment contracts for each employee
-- -----------------------------------------------------------------------------
INSERT INTO public.employment_contracts (
  employee_id,
  contract_type,
  start_date,
  end_date,
  max_hours_per_day,
  max_hours_per_week,
  min_rest_hours_between_shifts,
  is_overtime_eligible,
  notes
)
SELECT 
  e.id as employee_id,
  'permanent'::employment_contract_type as contract_type,
  e.hire_date as start_date,
  NULL as end_date, -- Permanent contract
  8 as max_hours_per_day, -- Standard 8-hour workday
  40 as max_hours_per_week, -- Standard 40-hour workweek
  11 as min_rest_hours_between_shifts, -- Legal minimum rest period
  COALESCE(w.overtime_availability, true) as is_overtime_eligible,
  'Default contract created during HR domain migration' as notes
FROM public.employees e
JOIN public.workers w ON e.worker_legacy_id = w.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.employment_contracts ec WHERE ec.employee_id = e.id
);

-- Validation: Verify contract creation
DO $$
DECLARE
  v_contract_count INTEGER;
  v_employee_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_contract_count FROM public.employment_contracts;
  SELECT COUNT(*) INTO v_employee_count FROM public.employees;
  
  RAISE NOTICE 'Phase 2 complete: % employment contracts created for % employees', v_contract_count, v_employee_count;
  
  IF v_contract_count < v_employee_count THEN
    RAISE WARNING 'Not all employees have contracts: % contracts for % employees', v_contract_count, v_employee_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Phase 3: Create default compensation rates for each employee
-- -----------------------------------------------------------------------------
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,
  hourly_rate,
  overtime_multiplier,
  currency_code,
  notes
)
SELECT 
  e.id as employee_id,
  e.hire_date as effective_from,
  NULL as effective_to, -- Current rate
  15.00 as hourly_rate, -- Default base rate - ADJUST BASED ON YOUR ORG
  1.50 as overtime_multiplier, -- Standard +50% OT rate
  'USD' as currency_code,
  'Base compensation created during migration. Department: ' || w.department as notes
FROM public.employees e
JOIN public.workers w ON e.worker_legacy_id = w.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.compensation_rates cr WHERE cr.employee_id = e.id
);

-- Validation: Verify compensation creation
DO $$
DECLARE
  v_comp_count INTEGER;
  v_employee_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_comp_count FROM public.compensation_rates;
  SELECT COUNT(*) INTO v_employee_count FROM public.employees;
  
  RAISE NOTICE 'Phase 3 complete: % compensation rates created for % employees', v_comp_count, v_employee_count;
  
  IF v_comp_count < v_employee_count THEN
    RAISE WARNING 'Not all employees have compensation rates: % rates for % employees', v_comp_count, v_employee_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Phase 4: Create leave balances for each active employee
-- -----------------------------------------------------------------------------
INSERT INTO public.leave_balances (
  employee_id,
  leave_type,
  balance_hours,
  accrual_rate_per_month,
  max_balance_hours,
  notes
)
SELECT 
  e.id as employee_id,
  leave_type,
  initial_balance,
  accrual,
  max_balance,
  'Initial leave balance created during migration'
FROM public.employees e
CROSS JOIN (
  VALUES 
    ('annual_leave'::hr_leave_type, 80, 10, 200),  -- 80 hours initial, accrue 10/month, max 200
    ('sick_leave'::hr_leave_type, 40, 5, 80)       -- 40 hours initial, accrue 5/month, max 80
) AS leave_config(leave_type, initial_balance, accrual, max_balance)
WHERE e.status = 'active'::employee_status
  AND NOT EXISTS (
    SELECT 1 FROM public.leave_balances lb 
    WHERE lb.employee_id = e.id AND lb.leave_type = leave_config.leave_type
  );

-- Validation: Verify leave balance creation
DO $$
DECLARE
  v_leave_count INTEGER;
  v_active_count INTEGER;
  v_expected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_leave_count FROM public.leave_balances;
  SELECT COUNT(*) INTO v_active_count FROM public.employees WHERE status = 'active';
  v_expected_count := v_active_count * 2; -- 2 leave types per active employee
  
  RAISE NOTICE 'Phase 4 complete: % leave balances created for % active employees', v_leave_count, v_active_count;
  
  IF v_leave_count < v_expected_count THEN
    RAISE WARNING 'Expected % leave balances but created %', v_expected_count, v_leave_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Phase 5: Add employee_id to worker_assignments (preparation for dual-write)
-- -----------------------------------------------------------------------------
ALTER TABLE public.worker_assignments 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_worker_assignments_employee_id 
  ON public.worker_assignments(employee_id);

-- Backfill employee_id in worker_assignments based on worker_id
UPDATE public.worker_assignments wa
SET employee_id = e.id
FROM public.employees e
WHERE wa.worker_id = e.worker_legacy_id
  AND wa.employee_id IS NULL;

-- Validation: Verify assignment backfill
DO $$
DECLARE
  v_total_assignments INTEGER;
  v_with_employee_id INTEGER;
  v_missing_employee_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_assignments FROM public.worker_assignments;
  SELECT COUNT(*) INTO v_with_employee_id FROM public.worker_assignments WHERE employee_id IS NOT NULL;
  v_missing_employee_id := v_total_assignments - v_with_employee_id;
  
  RAISE NOTICE 'Phase 5 complete: % of % assignments backfilled with employee_id', v_with_employee_id, v_total_assignments;
  
  IF v_missing_employee_id > 0 THEN
    RAISE WARNING '% assignments missing employee_id (may reference deleted workers)', v_missing_employee_id;
    RAISE NOTICE 'Query orphaned assignments: SELECT * FROM worker_assignments WHERE employee_id IS NULL';
  ELSE
    RAISE NOTICE '✓ All assignments have employee_id';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Phase 6: Create function to auto-sync employee_id when worker_id is set
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_worker_assignment_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When worker_id is set, automatically populate employee_id
  IF NEW.worker_id IS NOT NULL AND (NEW.employee_id IS NULL OR OLD.worker_id != NEW.worker_id) THEN
    SELECT e.id INTO NEW.employee_id
    FROM public.employees e
    WHERE e.worker_legacy_id = NEW.worker_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to sync employee_id on insert/update
DROP TRIGGER IF EXISTS sync_employee_id_on_worker_assignment ON public.worker_assignments;
CREATE TRIGGER sync_employee_id_on_worker_assignment
  BEFORE INSERT OR UPDATE ON public.worker_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_worker_assignment_employee_id();

-- -----------------------------------------------------------------------------
-- Phase 7: Create backward compatibility views
-- -----------------------------------------------------------------------------

-- View to see employees with their legacy worker data combined
CREATE OR REPLACE VIEW employee_worker_view AS
SELECT 
  e.id as employee_id,
  e.employee_number,
  e.first_name || ' ' || e.last_name as full_name,
  e.email,
  e.status as employee_status,
  e.hire_date,
  w.id as worker_id,
  w.department,
  w.overtime_availability,
  w.overall_rating,
  w.attendance_score,
  w.quality_score,
  w.speed_score,
  w.teamwork_rating,
  w.sheets_per_hour,
  w.lateness_minutes,
  ec.contract_type,
  ec.max_hours_per_day,
  ec.max_hours_per_week,
  ec.is_overtime_eligible,
  cr.hourly_rate,
  cr.overtime_multiplier,
  cr.currency_code
FROM public.employees e
LEFT JOIN public.workers w ON e.worker_legacy_id = w.id
LEFT JOIN LATERAL (
  SELECT * FROM public.employment_contracts 
  WHERE employee_id = e.id 
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ORDER BY start_date DESC
  LIMIT 1
) ec ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.compensation_rates 
  WHERE employee_id = e.id 
    AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1
) cr ON true;

-- Grant view access to authenticated users
GRANT SELECT ON employee_worker_view TO authenticated;

RAISE NOTICE 'Phase 7 complete: employee_worker_view created';

-- -----------------------------------------------------------------------------
-- Phase 8: Final data integrity checks
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_employees_no_contract INTEGER;
  v_employees_no_compensation INTEGER;
  v_integrity_pass BOOLEAN := true;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL DATA INTEGRITY CHECKS ===';
  
  -- Check all employees have contracts
  SELECT COUNT(*) INTO v_employees_no_contract
  FROM public.employees e
  WHERE NOT EXISTS (SELECT 1 FROM public.employment_contracts ec WHERE ec.employee_id = e.id);
  
  IF v_employees_no_contract > 0 THEN
    RAISE WARNING '% employees missing employment contracts', v_employees_no_contract;
    v_integrity_pass := false;
  END IF;
  
  -- Check all employees have compensation
  SELECT COUNT(*) INTO v_employees_no_compensation
  FROM public.employees e
  WHERE NOT EXISTS (SELECT 1 FROM public.compensation_rates cr WHERE cr.employee_id = e.id);
  
  IF v_employees_no_compensation > 0 THEN
    RAISE WARNING '% employees missing compensation rates', v_employees_no_compensation;
    v_integrity_pass := false;
  END IF;
  
  IF v_integrity_pass THEN
    RAISE NOTICE '✓ All integrity checks passed';
  ELSE
    RAISE WARNING 'Some integrity checks failed - review warnings above';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Post-migration data quality checks (informational queries)
-- -----------------------------------------------------------------------------

-- Count employees created
DO $$ 
DECLARE
  employee_count INTEGER;
  worker_count INTEGER;
  contract_count INTEGER;
  compensation_count INTEGER;
  leave_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO employee_count FROM public.employees;
  SELECT COUNT(*) INTO worker_count FROM public.workers;
  SELECT COUNT(*) INTO contract_count FROM public.employment_contracts;
  SELECT COUNT(*) INTO compensation_count FROM public.compensation_rates;
  SELECT COUNT(*) INTO leave_count FROM public.leave_balances;
  
  RAISE NOTICE 'HR Domain Backfill Summary:';
  RAISE NOTICE '- Workers in legacy table: %', worker_count;
  RAISE NOTICE '- Employees created: %', employee_count;
  RAISE NOTICE '- Employment contracts created: %', contract_count;
  RAISE NOTICE '- Compensation rates created: %', compensation_count;
  RAISE NOTICE '- Leave balances created: %', leave_count;
  
  RAISE NOTICE '';
  
  IF employee_count != worker_count THEN
    RAISE WARNING 'Mismatch: % employees vs % workers - check for conflicts', employee_count, worker_count;
  ELSE
    RAISE NOTICE '✓ Employee count matches worker count';
  END IF;
  
  IF contract_count = employee_count AND compensation_count = employee_count THEN
    RAISE NOTICE '✓✓✓ BACKFILL MIGRATION SUCCESSFUL ✓✓✓';
    RAISE NOTICE '';
    RAISE NOTICE 'All workers successfully migrated to HR domain.';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Run post-migration verification: 20260221143250_post_migration_verification.sql';
    RAISE NOTICE '2. Generate TypeScript types: supabase gen types typescript --local > src/integrations/supabase/types.ts';
    RAISE NOTICE '3. Create React Query hooks for HR entities (see HR_MIGRATION_GUIDE.md)';
    RAISE NOTICE '4. Begin dual-write phase: use both worker_id and employee_id in assignments';
    RAISE NOTICE '5. Update application to query employee_worker_view for reports';
  ELSE
    RAISE WARNING 'Migration incomplete or has issues - review counts above';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Comments and documentation
-- -----------------------------------------------------------------------------

COMMENT ON TABLE employees IS 'HR domain master profile for all employees. Links to legacy workers via worker_legacy_id during transition period.';
COMMENT ON COLUMN employees.worker_legacy_id IS 'Foreign key to legacy workers table. Used during dual-write phase. Will be deprecated after full migration.';
COMMENT ON COLUMN worker_assignments.employee_id IS 'Links assignment to HR employee. Automatically synced from worker_id during transition.';
COMMENT ON VIEW employee_worker_view IS 'Consolidated view showing employee HR data with legacy worker performance metrics. Use for reporting during transition.';

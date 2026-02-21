-- Post-migration data integrity verification
-- Run this AFTER the backfill migration to verify data integrity
-- This validates that workers -> employees migration was successful

-- -----------------------------------------------------------------------------
-- Verification 1: Record count matching
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_worker_count INTEGER;
  v_employee_count INTEGER;
  v_contract_count INTEGER;
  v_compensation_count INTEGER;
  v_active_leave_count INTEGER;
  v_expected_leave_count INTEGER;
BEGIN
  RAISE NOTICE '=== RECORD COUNT VERIFICATION ===';
  
  SELECT COUNT(*) INTO v_worker_count FROM public.workers;
  SELECT COUNT(*) INTO v_employee_count FROM public.employees;
  SELECT COUNT(*) INTO v_contract_count FROM public.employment_contracts;
  SELECT COUNT(*) INTO v_compensation_count FROM public.compensation_rates;
  SELECT COUNT(*) INTO v_active_leave_count FROM public.leave_balances;
  
  RAISE NOTICE 'Workers: %', v_worker_count;
  RAISE NOTICE 'Employees: %', v_employee_count;
  RAISE NOTICE 'Contracts: %', v_contract_count;
  RAISE NOTICE 'Compensation rates: %', v_compensation_count;
  RAISE NOTICE 'Leave balances: %', v_active_leave_count;
  
  -- Calculate expected leave balances (2 per active employee)
  SELECT COUNT(*) * 2 INTO v_expected_leave_count 
  FROM public.employees 
  WHERE status = 'active';
  
  -- Validations
  IF v_employee_count != v_worker_count THEN
    RAISE WARNING 'MISMATCH: Expected % employees but got %', v_worker_count, v_employee_count;
    RAISE NOTICE 'Check for conflicts: SELECT worker_legacy_id FROM employees WHERE worker_legacy_id IS NOT NULL GROUP BY worker_legacy_id HAVING COUNT(*) > 1';
  ELSE
    RAISE NOTICE '✓ Employee count matches worker count';
  END IF;
  
  IF v_contract_count != v_employee_count THEN
    RAISE WARNING 'MISMATCH: Expected % contracts but got %', v_employee_count, v_contract_count;
  ELSE
    RAISE NOTICE '✓ One contract per employee created';
  END IF;
  
  IF v_compensation_count != v_employee_count THEN
    RAISE WARNING 'MISMATCH: Expected % compensation rates but got %', v_employee_count, v_compensation_count;
  ELSE
    RAISE NOTICE '✓ One compensation rate per employee created';
  END IF;
  
  IF v_active_leave_count != v_expected_leave_count THEN
    RAISE WARNING 'MISMATCH: Expected % leave balances but got %', v_expected_leave_count, v_active_leave_count;
    RAISE NOTICE 'Expected 2 leave types (annual + sick) per active employee';
  ELSE
    RAISE NOTICE '✓ Leave balances created for active employees';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 2: Foreign key integrity
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_orphaned_contracts INTEGER;
  v_orphaned_compensation INTEGER;
  v_orphaned_leave INTEGER;
  v_invalid_worker_legacy_id INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FOREIGN KEY INTEGRITY ===';
  
  -- Check contracts reference valid employees
  SELECT COUNT(*) INTO v_orphaned_contracts
  FROM public.employment_contracts ec
  WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = ec.employee_id);
  
  IF v_orphaned_contracts > 0 THEN
    RAISE ERROR '% orphaned contracts found (employee_id invalid)', v_orphaned_contracts;
  ELSE
    RAISE NOTICE '✓ All contracts reference valid employees';
  END IF;
  
  -- Check compensation rates reference valid employees
  SELECT COUNT(*) INTO v_orphaned_compensation
  FROM public.compensation_rates cr
  WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = cr.employee_id);
  
  IF v_orphaned_compensation > 0 THEN
    RAISE ERROR '% orphaned compensation rates found', v_orphaned_compensation;
  ELSE
    RAISE NOTICE '✓ All compensation rates reference valid employees';
  END IF;
  
  -- Check leave balances reference valid employees
  SELECT COUNT(*) INTO v_orphaned_leave
  FROM public.leave_balances lb
  WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = lb.employee_id);
  
  IF v_orphaned_leave > 0 THEN
    RAISE ERROR '% orphaned leave balances found', v_orphaned_leave;
  ELSE
    RAISE NOTICE '✓ All leave balances reference valid employees';
  END IF;
  
  -- Check employees reference valid workers
  SELECT COUNT(*) INTO v_invalid_worker_legacy_id
  FROM public.employees e
  WHERE e.worker_legacy_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = e.worker_legacy_id);
  
  IF v_invalid_worker_legacy_id > 0 THEN
    RAISE ERROR '% employees have invalid worker_legacy_id references', v_invalid_worker_legacy_id;
  ELSE
    RAISE NOTICE '✓ All employees reference valid legacy workers';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 3: worker_assignments dual-write setup
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_assignments INTEGER;
  v_assignments_with_employee_id INTEGER;
  v_assignments_missing_employee_id INTEGER;
  v_mismatched_assignments INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== WORKER ASSIGNMENTS DUAL-WRITE VERIFICATION ===';
  
  SELECT COUNT(*) INTO v_total_assignments FROM public.worker_assignments;
  
  SELECT COUNT(*) INTO v_assignments_with_employee_id
  FROM public.worker_assignments
  WHERE employee_id IS NOT NULL;
  
  v_assignments_missing_employee_id := v_total_assignments - v_assignments_with_employee_id;
  
  RAISE NOTICE 'Total assignments: %', v_total_assignments;
  RAISE NOTICE 'Assignments with employee_id: %', v_assignments_with_employee_id;
  RAISE NOTICE 'Assignments missing employee_id: %', v_assignments_missing_employee_id;
  
  IF v_assignments_missing_employee_id > 0 THEN
    RAISE WARNING '% assignments missing employee_id (may reference deleted workers)', v_assignments_missing_employee_id;
    RAISE NOTICE 'Query: SELECT wa.* FROM worker_assignments wa LEFT JOIN employees e ON e.worker_legacy_id = wa.worker_id WHERE wa.employee_id IS NULL';
  ELSE
    RAISE NOTICE '✓ All assignments have employee_id populated';
  END IF;
  
  -- Verify employee_id matches worker_id
  SELECT COUNT(*) INTO v_mismatched_assignments
  FROM public.worker_assignments wa
  JOIN public.employees e ON wa.employee_id = e.id
  WHERE e.worker_legacy_id != wa.worker_id;
  
  IF v_mismatched_assignments > 0 THEN
    RAISE ERROR '% assignments have mismatched worker_id and employee_id', v_mismatched_assignments;
  ELSE
    RAISE NOTICE '✓ All employee_id references match worker_id';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 4: Trigger functionality test
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TRIGGER VERIFICATION ===';
  
  -- Check if sync trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'sync_employee_id_on_worker_assignment'
  ) INTO v_trigger_exists;
  
  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Auto-sync trigger exists';
  ELSE
    RAISE ERROR 'sync_employee_id_on_worker_assignment trigger is missing!';
  END IF;
  
  -- Note: Actual trigger functionality will be tested by new assignment inserts
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 5: Data quality checks
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_employees_no_contract INTEGER;
  v_employees_no_compensation INTEGER;
  v_active_employees_no_leave INTEGER;
  v_contracts_invalid_dates INTEGER;
  v_compensation_invalid_dates INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== DATA QUALITY CHECKS ===';
  
  -- Check employees without contracts
  SELECT COUNT(*) INTO v_employees_no_contract
  FROM public.employees e
  WHERE NOT EXISTS (SELECT 1 FROM public.employment_contracts ec WHERE ec.employee_id = e.id);
  
  IF v_employees_no_contract > 0 THEN
    RAISE WARNING '% employees have no employment contract', v_employees_no_contract;
  ELSE
    RAISE NOTICE '✓ All employees have employment contracts';
  END IF;
  
  -- Check employees without compensation
  SELECT COUNT(*) INTO v_employees_no_compensation
  FROM public.employees e
  WHERE NOT EXISTS (SELECT 1 FROM public.compensation_rates cr WHERE cr.employee_id = e.id);
  
  IF v_employees_no_compensation > 0 THEN
    RAISE WARNING '% employees have no compensation rate', v_employees_no_compensation;
  ELSE
    RAISE NOTICE '✓ All employees have compensation rates';
  END IF;
  
  -- Check active employees without leave balances
  SELECT COUNT(*) INTO v_active_employees_no_leave
  FROM public.employees e
  WHERE e.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_balances lb 
      WHERE lb.employee_id = e.id 
        AND lb.leave_type = 'vacation'
    );
  
  IF v_active_employees_no_leave > 0 THEN
    RAISE WARNING '% active employees missing leave balances', v_active_employees_no_leave;
  ELSE
    RAISE NOTICE '✓ All active employees have leave balances';
  END IF;
  
  -- Check contracts with invalid date ranges
  SELECT COUNT(*) INTO v_contracts_invalid_dates
  FROM public.employment_contracts
  WHERE end_date IS NOT NULL AND end_date < start_date;
  
  IF v_contracts_invalid_dates > 0 THEN
    RAISE ERROR '% contracts have end_date before start_date', v_contracts_invalid_dates;
  ELSE
    RAISE NOTICE '✓ All contract date ranges are valid';
  END IF;
  
  -- Check compensation with invalid date ranges
  SELECT COUNT(*) INTO v_compensation_invalid_dates
  FROM public.compensation_rates
  WHERE effective_to IS NOT NULL AND effective_to < effective_from;
  
  IF v_compensation_invalid_dates > 0 THEN
    RAISE ERROR '% compensation rates have effective_to before effective_from', v_compensation_invalid_dates;
  ELSE
    RAISE NOTICE '✓ All compensation date ranges are valid';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 6: Backward compatibility view
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_view_exists BOOLEAN;
  v_view_row_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BACKWARD COMPATIBILITY VIEW ===';
  
  -- Check if view exists
  SELECT EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' 
      AND viewname = 'employee_worker_view'
  ) INTO v_view_exists;
  
  IF NOT v_view_exists THEN
    RAISE ERROR 'employee_worker_view does not exist!';
  END IF;
  
  -- Test view can be queried
  BEGIN
    SELECT COUNT(*) INTO v_view_row_count FROM employee_worker_view;
    RAISE NOTICE '✓ employee_worker_view exists and is queryable';
    RAISE NOTICE '  - View returns % rows', v_view_row_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE ERROR 'employee_worker_view exists but cannot be queried: %', SQLERRM;
  END;
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 7: Sample data spot-check
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_sample RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SAMPLE DATA SPOT-CHECK ===';
  RAISE NOTICE 'Showing 3 random employees with their HR data:';
  RAISE NOTICE '';
  
  FOR v_sample IN
    SELECT 
      e.employee_number,
      e.full_name,
      e.department,
      e.status,
      e.hire_date,
      ec.contract_type,
      ec.base_hours_per_week,
      ec.overtime_allowed,
      cr.hourly_rate,
      cr.overtime_multiplier_50,
      cr.currency_code,
      (SELECT COUNT(*) FROM leave_balances lb WHERE lb.employee_id = e.id) as leave_types
    FROM employee_worker_view e
    LEFT JOIN public.employment_contracts ec ON ec.employee_id = e.employee_id
    LEFT JOIN public.compensation_rates cr ON cr.employee_id = e.employee_id
    ORDER BY RANDOM()
    LIMIT 3
  LOOP
    RAISE NOTICE '---';
    RAISE NOTICE 'Employee: % - %', v_sample.employee_number, v_sample.full_name;
    RAISE NOTICE '  Department: %', v_sample.department;
    RAISE NOTICE '  Status: %', v_sample.status;
    RAISE NOTICE '  Hire date: %', v_sample.hire_date;
    RAISE NOTICE '  Contract: % (% hrs/week, OT allowed: %)', 
      v_sample.contract_type, 
      v_sample.base_hours_per_week,
      v_sample.overtime_allowed;
    RAISE NOTICE '  Compensation: % %/hr (OT: %x)', 
      v_sample.currency_code,
      v_sample.hourly_rate, 
      v_sample.overtime_multiplier_50;
    RAISE NOTICE '  Leave types: %', v_sample.leave_types;
  END LOOP;
  
  RAISE NOTICE '';
  
END $$;

-- -----------------------------------------------------------------------------
-- Verification 8: Test effective-date queries
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_test_employee_id UUID;
  v_contract RECORD;
  v_compensation RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== EFFECTIVE-DATE QUERY TEST ===';
  
  -- Get a random employee
  SELECT id INTO v_test_employee_id FROM public.employees LIMIT 1;
  
  IF v_test_employee_id IS NULL THEN
    RAISE NOTICE 'No employees found for testing';
    RETURN;
  END IF;
  
  -- Test get_contract_at_date
  BEGIN
    SELECT * INTO v_contract 
    FROM public.get_contract_at_date(v_test_employee_id, CURRENT_DATE);
    
    IF v_contract IS NOT NULL THEN
      RAISE NOTICE '✓ get_contract_at_date() works';
      RAISE NOTICE '  - Returns contract type: %', v_contract.contract_type;
    ELSE
      RAISE WARNING 'get_contract_at_date() returned NULL';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE ERROR 'get_contract_at_date() failed: %', SQLERRM;
  END;
  
  -- Test get_compensation_at_date
  BEGIN
    SELECT * INTO v_compensation 
    FROM public.get_compensation_at_date(v_test_employee_id, CURRENT_DATE);
    
    IF v_compensation IS NOT NULL THEN
      RAISE NOTICE '✓ get_compensation_at_date() works';
      RAISE NOTICE '  - Returns rate: % %', v_compensation.hourly_rate, v_compensation.currency_code;
    ELSE
      RAISE WARNING 'get_compensation_at_date() returned NULL';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE ERROR 'get_compensation_at_date() failed: %', SQLERRM;
  END;
  
END $$;

-- -----------------------------------------------------------------------------
-- Final summary
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_worker_count INTEGER;
  v_employee_count INTEGER;
  v_success_rate NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== POST-MIGRATION VERIFICATION COMPLETE ===';
  
  SELECT COUNT(*) INTO v_worker_count FROM public.workers;
  SELECT COUNT(*) INTO v_employee_count FROM public.employees;
  
  v_success_rate := ROUND((v_employee_count::NUMERIC / NULLIF(v_worker_count, 0)) * 100, 1);
  
  RAISE NOTICE '';
  RAISE NOTICE 'Migration success rate: %% (% of % workers migrated)', 
    v_success_rate, v_employee_count, v_worker_count;
  RAISE NOTICE '';
  
  IF v_success_rate >= 100 THEN
    RAISE NOTICE '✓✓✓ MIGRATION SUCCESSFUL ✓✓✓';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Review any warnings above';
    RAISE NOTICE '  2. Generate TypeScript types: supabase gen types typescript --local > src/integrations/supabase/types.ts';
    RAISE NOTICE '  3. Create React Query hooks for HR entities';
    RAISE NOTICE '  4. Test effective-date queries in application';
    RAISE NOTICE '  5. Update API routes to use employee_id';
  ELSE
    RAISE WARNING 'Migration incomplete - review errors above';
  END IF;
  
END $$;

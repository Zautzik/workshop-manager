-- Pre-migration data integrity checks for HR domain backfill
-- Run this BEFORE applying the backfill migration to identify potential issues
-- This is a read-only check script - it does not modify data

-- -----------------------------------------------------------------------------
-- Check 1: Workers table validation
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_workers INTEGER;
  v_workers_no_name INTEGER;
  v_workers_no_dept INTEGER;
  v_duplicate_names INTEGER;
  v_invalid_dates INTEGER;
BEGIN
  RAISE NOTICE '=== WORKERS TABLE VALIDATION ===';
  
  -- Count total workers
  SELECT COUNT(*) INTO v_total_workers FROM public.workers;
  RAISE NOTICE 'Total workers found: %', v_total_workers;
  
  -- Check for missing names
  SELECT COUNT(*) INTO v_workers_no_name 
  FROM public.workers 
  WHERE name IS NULL OR TRIM(name) = '';
  
  IF v_workers_no_name > 0 THEN
    RAISE WARNING '% workers have missing or empty names', v_workers_no_name;
    RAISE NOTICE 'Query to see them: SELECT id, name, department FROM workers WHERE name IS NULL OR TRIM(name) = ''''';
  ELSE
    RAISE NOTICE '✓ All workers have names';
  END IF;
  
  -- Check for missing departments
  SELECT COUNT(*) INTO v_workers_no_dept 
  FROM public.workers 
  WHERE department IS NULL OR TRIM(department) = '';
  
  IF v_workers_no_dept > 0 THEN
    RAISE WARNING '% workers have missing departments', v_workers_no_dept;
    RAISE NOTICE 'Query: SELECT id, name, department FROM workers WHERE department IS NULL OR TRIM(department) = ''''';
  ELSE
    RAISE NOTICE '✓ All workers have departments';
  END IF;
  
  -- Check for potential duplicate names
  SELECT COUNT(*) INTO v_duplicate_names
  FROM (
    SELECT name, COUNT(*) as cnt
    FROM public.workers
    GROUP BY name
    HAVING COUNT(*) > 1
  ) dupes;
  
  IF v_duplicate_names > 0 THEN
    RAISE WARNING '% duplicate names found (may cause email conflicts)', v_duplicate_names;
    RAISE NOTICE 'Query: SELECT name, COUNT(*) FROM workers GROUP BY name HAVING COUNT(*) > 1';
  ELSE
    RAISE NOTICE '✓ All worker names are unique';
  END IF;
  
  -- Check for invalid timestamps
  SELECT COUNT(*) INTO v_invalid_dates
  FROM public.workers
  WHERE created_at IS NULL OR created_at > CURRENT_TIMESTAMP;
  
  IF v_invalid_dates > 0 THEN
    RAISE WARNING '% workers have invalid created_at dates', v_invalid_dates;
  ELSE
    RAISE NOTICE '✓ All created_at dates are valid';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 2: Worker assignments validation
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_assignments INTEGER;
  v_orphaned_assignments INTEGER;
  v_future_assignments INTEGER;
  v_very_old_assignments INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== WORKER ASSIGNMENTS VALIDATION ===';
  
  SELECT COUNT(*) INTO v_total_assignments FROM public.worker_assignments;
  RAISE NOTICE 'Total assignments found: %', v_total_assignments;
  
  -- Check for orphaned assignments (worker no longer exists)
  SELECT COUNT(*) INTO v_orphaned_assignments
  FROM public.worker_assignments wa
  WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = wa.worker_id);
  
  IF v_orphaned_assignments > 0 THEN
    RAISE WARNING '% orphaned assignments (worker_id references deleted workers)', v_orphaned_assignments;
    RAISE NOTICE 'Query: SELECT * FROM worker_assignments wa WHERE NOT EXISTS (SELECT 1 FROM workers WHERE id = wa.worker_id)';
  ELSE
    RAISE NOTICE '✓ All assignments have valid worker references';
  END IF;
  
  -- Check for assignments with future dates (more than 7 days ahead)
  SELECT COUNT(*) INTO v_future_assignments
  FROM public.worker_assignments
  WHERE date > CURRENT_DATE + INTERVAL '7 days';
  
  IF v_future_assignments > 0 THEN
    RAISE NOTICE 'INFO: % assignments scheduled more than 7 days in future', v_future_assignments;
  END IF;
  
  -- Check for very old assignments (older than 2 years)
  SELECT COUNT(*) INTO v_very_old_assignments
  FROM public.worker_assignments
  WHERE date < CURRENT_DATE - INTERVAL '2 years';
  
  IF v_very_old_assignments > 0 THEN
    RAISE NOTICE 'INFO: % assignments older than 2 years (historical data)', v_very_old_assignments;
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 3: Department analysis
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_dept RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== DEPARTMENT ANALYSIS ===';
  
  FOR v_dept IN 
    SELECT 
      COALESCE(NULLIF(TRIM(department), ''), 'UNKNOWN') as dept,
      COUNT(*) as worker_count
    FROM public.workers
    GROUP BY COALESCE(NULLIF(TRIM(department), ''), 'UNKNOWN')
    ORDER BY COUNT(*) DESC
  LOOP
    RAISE NOTICE '  % - % workers', RPAD(v_dept.dept, 25), v_dept.worker_count;
  END LOOP;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 4: Overtime availability analysis
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_ot_null INTEGER;
  v_ot_available INTEGER;
  v_ot_not_available INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== OVERTIME AVAILABILITY ANALYSIS ===';
  
  SELECT 
    COUNT(*) FILTER (WHERE overtime_availability IS NULL),
    COUNT(*) FILTER (WHERE overtime_availability = true),
    COUNT(*) FILTER (WHERE overtime_availability = false)
  INTO v_ot_null, v_ot_available, v_ot_not_available
  FROM public.workers;
  
  RAISE NOTICE 'Overtime availability: NULL';
  RAISE NOTICE '  NULL (will default to eligible): %', v_ot_null;
  RAISE NOTICE '  Eligible: %', v_ot_available;
  RAISE NOTICE '  Not eligible: %', v_ot_not_available;
  
  IF v_ot_not_available > 0 THEN
    RAISE NOTICE 'Query ineligible workers: SELECT id, name, department FROM workers WHERE overtime_availability = false';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 5: Performance metrics completeness
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_missing_ratings INTEGER;
  v_avg_overall NUMERIC;
  v_avg_quality NUMERIC;
  v_avg_speed NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== PERFORMANCE METRICS ANALYSIS ===';
  
  SELECT COUNT(*) INTO v_missing_ratings
  FROM public.workers
  WHERE overall_rating IS NULL;
  
  IF v_missing_ratings > 0 THEN
    RAISE NOTICE 'INFO: % workers have NULL overall_rating', v_missing_ratings;
  END IF;
  
  SELECT 
    ROUND(AVG(overall_rating), 1),
    ROUND(AVG(quality_score), 1),
    ROUND(AVG(speed_score), 1)
  INTO v_avg_overall, v_avg_quality, v_avg_speed
  FROM public.workers
  WHERE overall_rating IS NOT NULL;
  
  RAISE NOTICE 'Average ratings (non-null):';
  RAISE NOTICE '  Overall: %', COALESCE(v_avg_overall, 0);
  RAISE NOTICE '  Quality: %', COALESCE(v_avg_quality, 0);
  RAISE NOTICE '  Speed: %', COALESCE(v_avg_speed, 0);
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 6: Name parsing preview (for employee creation)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_single_names INTEGER;
  v_sample RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== NAME PARSING PREVIEW ===';
  
  -- Count workers with single-word names
  SELECT COUNT(*) INTO v_single_names
  FROM public.workers
  WHERE name NOT LIKE '% %';
  
  IF v_single_names > 0 THEN
    RAISE WARNING '% workers have single-word names (will use "Employee" as last name)', v_single_names;
    RAISE NOTICE 'Query: SELECT id, name FROM workers WHERE name NOT LIKE ''%% %%''';
  ELSE
    RAISE NOTICE '✓ All workers have multi-word names';
  END IF;
  
  -- Show sample of name parsing
  RAISE NOTICE '';
  RAISE NOTICE 'Sample name parsing (first 5):';
  FOR v_sample IN 
    SELECT 
      name as original,
      SPLIT_PART(name, ' ', 1) as first_name,
      CASE 
        WHEN name LIKE '% %' THEN SUBSTRING(name FROM POSITION(' ' IN name) + 1)
        ELSE 'Employee'
      END as last_name,
      LOWER(REPLACE(name, ' ', '.')) || '@workshop.local' as email
    FROM public.workers
    ORDER BY created_at
    LIMIT 5
  LOOP
    RAISE NOTICE '  % -> %, % (%)', 
      v_sample.original, 
      v_sample.first_name, 
      v_sample.last_name,
      v_sample.email;
  END LOOP;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 7: Email collision detection
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_email_collisions INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== EMAIL COLLISION DETECTION ===';
  
  SELECT COUNT(*) INTO v_email_collisions
  FROM (
    SELECT 
      LOWER(REPLACE(name, ' ', '.')) || '@workshop.local' as email,
      COUNT(*) as cnt
    FROM public.workers
    GROUP BY LOWER(REPLACE(name, ' ', '.')) || '@workshop.local'
    HAVING COUNT(*) > 1
  ) dupes;
  
  IF v_email_collisions > 0 THEN
    RAISE WARNING '% potential email collisions detected', v_email_collisions;
    RAISE NOTICE 'Query: SELECT name, LOWER(REPLACE(name, '' '', ''.'')) || ''@workshop.local'' as email FROM workers';
    RAISE NOTICE 'Consider: Adding employee numbers to emails (e.g., john.doe.00123@workshop.local)';
  ELSE
    RAISE NOTICE '✓ No email collisions expected';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Check 8: Pre-existing HR data check (idempotency)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_existing_employees INTEGER;
  v_existing_contracts INTEGER;
  v_existing_compensation INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== PRE-EXISTING HR DATA CHECK ===';
  
  SELECT COUNT(*) INTO v_existing_employees FROM public.employees;
  SELECT COUNT(*) INTO v_existing_contracts FROM public.employment_contracts;
  SELECT COUNT(*) INTO v_existing_compensation FROM public.compensation_rates;
  
  IF v_existing_employees > 0 OR v_existing_contracts > 0 OR v_existing_compensation > 0 THEN
    RAISE WARNING 'HR tables already contain data:';
    RAISE NOTICE '  - Employees: %', v_existing_employees;
    RAISE NOTICE '  - Contracts: %', v_existing_contracts;
    RAISE NOTICE '  - Compensation rates: %', v_existing_compensation;
    RAISE NOTICE 'Migration is idempotent (uses ON CONFLICT DO NOTHING) but review existing data.';
  ELSE
    RAISE NOTICE '✓ HR tables are empty (clean migration)';
  END IF;
  
END $$;

-- -----------------------------------------------------------------------------
-- Summary and recommendations
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== PRE-MIGRATION CHECK COMPLETE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Review warnings above before proceeding with backfill migration.';
  RAISE NOTICE '';
  RAISE NOTICE 'Common actions if issues found:';
  RAISE NOTICE '  1. Fix NULL/empty names or departments';
  RAISE NOTICE '  2. Resolve duplicate worker names';
  RAISE NOTICE '  3. Clean up orphaned worker_assignments';
  RAISE NOTICE '  4. Consider customizing default compensation rate ($15/hr)';
  RAISE NOTICE '';
  RAISE NOTICE 'If all checks pass, proceed with:';
  RAISE NOTICE '  supabase migration up --local';
  RAISE NOTICE '  OR';
  RAISE NOTICE '  supabase db push';
END $$;

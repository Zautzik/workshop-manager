-- Safe deprecation of legacy worker fields
-- Phase 1: Identify and document worker fields that can be deprecated
-- These are fields that have been migrated to HR domain and are no longer needed

-- This migration is NON-BREAKING:
-- - Keeps all legacy data and columns
-- - Creates views to map old field names to new HR tables
-- - Provides migration helper functions
-- - Enables gradual transition in application code
-- - Allows parallel use of workers and employees tables

-- ============================================================================
-- Phase 1: Create deprecation metadata
-- ============================================================================

-- Document which worker fields are deprecated and their HR equivalents
CREATE TABLE IF NOT EXISTS public.deprecated_worker_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_field_name TEXT NOT NULL,
  data_type TEXT,
  hr_table_name TEXT NOT NULL,
  hr_column_name TEXT NOT NULL,
  deprecation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  removal_target_date DATE,
  migration_notes TEXT,
  is_replaced_by TEXT,
  status TEXT NOT NULL DEFAULT 'deprecated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.deprecated_worker_fields (
  worker_field_name,
  data_type,
  hr_table_name,
  hr_column_name,
  removal_target_date,
  migration_notes,
  is_replaced_by
) VALUES
  -- Performance metrics (moved to historical/analytics)
  ('sheets_per_hour', 'integer', 'performance_analytics', 'sheets_per_hour', '2026-12-31', 
   'Worker productivity metric. Consider tracking in task_logs instead.', 'task_logs or analytics table'),
  
  ('overall_rating', 'integer', 'performance_analytics', 'overall_rating', '2026-12-31',
   'Historical performance rating. Discontinued in favor of HR-managed assessments.', 'employee skill ratings or assessments'),
  
  ('quality_score', 'integer', 'performance_analytics', 'quality_score', '2026-12-31',
   'Quality metric. Tracked via task_logs performance_rating now.', 'task_logs.performance_rating'),
  
  ('speed_score', 'integer', 'performance_analytics', 'speed_score', '2026-12-31',
   'Speed metric. Consider tracking in time_spent_minutes in task_logs.', 'task_logs metrics'),
  
  ('teamwork_rating', 'integer', 'performance_analytics', 'teamwork_rating', '2026-12-31',
   'Teamwork assessment. Moved to HR employee_skills with proficiency levels.', 'employee_skills + assessments'),
  
  ('attendance_score', 'integer', 'attendance_tracking', 'attendance_score', '2026-12-31',
   'Attendance metric. Now tracked via leave_balances and leave_requests.', 'leave_requests and attendance logs'),
  
  ('lateness_minutes', 'integer', 'attendance_tracking', 'lateness_minutes', '2026-12-31',
   'Lateness tracking. Can be tracked via task_logs timestamps.', 'task_logs or dedicated clock-in system'),
  
  -- Business rules (moved to employment_contracts)
  ('overtime_availability', 'boolean', 'employment_contracts', 'overtime_allowed', NULL,
   'Overtime eligibility. Replicated in employment_contracts during migration.', 'employment_contracts.overtime_allowed'),
  
  -- Identification (moved to employees table)
  ('name', 'text', 'employees', 'full_name', NULL,
   'Worker name. Split into first/last names in employees table during migration.', 'employees.first_name + employees.last_name'),
  
  ('department', 'text', 'employees', 'department', NULL,
   'Department assignment. Preserved in employees table during migration.', 'employees.department'),
  
  -- Timestamps (preserved in employees for reference)
  ('created_at', 'timestamptz', 'employees', 'created_at', NULL,
   'Creation timestamp. Preserved in employees table.', 'employees.created_at'),
  
  ('updated_at', 'timestamptz', 'employees', 'updated_at', NULL,
   'Update timestamp. Preserved in employees table.', 'employees.updated_at')
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.deprecated_worker_fields TO authenticated;

-- ============================================================================
-- Phase 2: Create compatibility views for gradual migration
-- ============================================================================
-- These views allow reading new HR data using old worker column names
-- This lets application code transition gradually without breaking

-- View: workers_legacy_view
-- Maps old worker table structure to new HR data
-- Use this as a drop-in replacement for SELECT * FROM workers
CREATE OR REPLACE VIEW public.workers_legacy_view AS
SELECT
  e.worker_legacy_id AS id,                          -- Keep original worker ID
  e.full_name AS name,                               -- Map employees.full_name → workers.name
  e.department,                                       -- Direct from employees
  
  -- Performance metrics (preserved from workers, but should migrate to analytics)
  w.sheets_per_hour,
  w.overall_rating,
  w.quality_score,
  w.speed_score,
  w.teamwork_rating,
  w.attendance_score,
  w.lateness_minutes,
  
  -- Business rules (from employment_contracts)
  COALESCE(ec.overtime_allowed, true) AS overtime_availability,
  
  -- Timestamps
  e.created_at,
  e.updated_at,
  
  -- HR reference (new data)
  e.id AS employee_id,
  e.employee_code,
  e.email,
  e.hire_date,
  
  -- Metadata
  'legacy_view'::text AS _source,
  CURRENT_TIMESTAMP AS _query_timestamp
FROM public.employees e
LEFT JOIN public.workers w ON e.worker_legacy_id = w.id
LEFT JOIN LATERAL (
  SELECT * FROM public.get_contract_at_date(e.id, CURRENT_DATE)
) ec ON true
WHERE e.status != 'terminated'::employee_status;

COMMENT ON VIEW public.workers_legacy_view IS 
  'Compatibility view mapping HR domain data to legacy worker table structure. ' ||
  'Use this for gradual migration of SELECT queries. Columns map to original workers table.';

GRANT SELECT ON public.workers_legacy_view TO authenticated;

-- View: workers_with_compensation
-- Joins workers with their current compensation data
CREATE OR REPLACE VIEW public.workers_with_compensation AS
SELECT
  w.*,
  cr.hourly_rate,
  cr.overtime_multiplier_50,
  cr.overtime_multiplier_100,
  cr.night_shift_multiplier,
  cr.weekend_multiplier,
  cr.currency_code,
  cr.effective_from,
  cr.effective_to
FROM public.workers_legacy_view w
LEFT JOIN public.get_compensation_at_date(w.employee_id, CURRENT_DATE) cr ON true;

COMMENT ON VIEW public.workers_with_compensation IS 
  'Compatibility view combining legacy worker data with current compensation rates. ' ||
  'Useful for reports that need both performance metrics and pay information.';

GRANT SELECT ON public.workers_with_compensation TO authenticated;

-- View: workers_full_profile
-- Most complete view: workers + contracts + compensation + skills
CREATE OR REPLACE VIEW public.workers_full_profile AS
SELECT
  w.*,
  
  -- Current employment contract
  ec.contract_type,
  ec.base_hours_per_week,
  ec.max_hours_per_day,
  ec.max_hours_per_week,
  ec.overtime_allowed,
  ec.overtime_cap_hours_per_week,
  ec.minimum_rest_hours,
  ec.start_date AS contract_start,
  ec.end_date AS contract_end,
  
  -- Current compensation
  cr.hourly_rate,
  cr.overtime_multiplier_50,
  cr.currency_code,
  
  -- Skills summary (count of skills by proficiency)
  (SELECT COUNT(*) FROM public.employee_skills 
   WHERE employee_id = w.employee_id AND proficiency_level >= 4) AS high_proficiency_skills,
  (SELECT COUNT(*) FROM public.employee_skills 
   WHERE employee_id = w.employee_id AND certified = true) AS certified_skills,
  
  -- Leave summary
  (SELECT COALESCE(SUM(balance_hours), 0) FROM public.leave_balances 
   WHERE employee_id = w.employee_id) AS total_leave_balance
   
FROM public.workers_with_compensation w
LEFT JOIN public.get_contract_at_date(w.employee_id, CURRENT_DATE) ec ON true
LEFT JOIN public.get_compensation_at_date(w.employee_id, CURRENT_DATE) cr ON true;

COMMENT ON VIEW public.workers_full_profile IS 
  'Comprehensive profile view combining worker legacy data with all HR domain data. ' ||
  'Useful for dashboards and reports that need complete worker information. Non-breaking.';

GRANT SELECT ON public.workers_full_profile TO authenticated;

-- ============================================================================
-- Phase 3: Create migration helper functions
-- ============================================================================

-- Function: get_worker_id_by_employee_id
-- Find worker ID (legacy) from employee ID (new)
CREATE OR REPLACE FUNCTION public.get_worker_id_by_employee_id(p_employee_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT worker_legacy_id FROM public.employees
  WHERE id = p_employee_id;
$$;

COMMENT ON FUNCTION public.get_worker_id_by_employee_id IS 
  'Helper function: convert employee_id to worker_id for legacy code. Returns NULL if no legacy worker.';

-- Function: get_employee_id_by_worker_id
-- Find employee ID (new) from worker ID (legacy)
CREATE OR REPLACE FUNCTION public.get_employee_id_by_worker_id(p_worker_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees
  WHERE worker_legacy_id = p_worker_id;
$$;

COMMENT ON FUNCTION public.get_employee_id_by_worker_id IS 
  'Helper function: convert worker_id to employee_id for new HR code. Returns NULL if worker not migrated.';

-- Function: deprecation_warning()
-- Returns deprecation warning message for a field
CREATE OR REPLACE FUNCTION public.deprecation_warning(p_field_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    'DEPRECATED: Field "' || worker_field_name || '" will be removed on ' || 
    COALESCE(removal_target_date::text, 'TBD') || '. ' ||
    'Migrate to: ' || is_replaced_by || '. ' ||
    'Details: ' || migration_notes
  FROM public.deprecated_worker_fields
  WHERE worker_field_name = p_field_name;
$$;

-- ============================================================================
-- Phase 4: Create backward-compatible update trigger
-- ============================================================================
-- When legacy code updates workers table, sync to HR domain

CREATE OR REPLACE FUNCTION public.sync_workers_to_hr_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  -- Find corresponding employee
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE worker_legacy_id = NEW.id;
  
  IF v_employee_id IS NOT NULL THEN
    -- Sync updated fields to employees table
    UPDATE public.employees
    SET
      full_name = NEW.name,
      department = NEW.department,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_employee_id;
    
    -- Sync overtime_availability to contracts
    UPDATE public.employment_contracts
    SET overtime_allowed = NEW.overtime_availability
    WHERE employee_id = v_employee_id
      AND (end_date IS NULL OR end_date >= CURRENT_DATE);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_workers_to_employees ON public.workers;
CREATE TRIGGER sync_workers_to_employees
  AFTER UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_workers_to_hr_domain();

COMMENT ON TRIGGER sync_workers_to_employees ON public.workers IS 
  'Backward-compatible: when legacy worker code updates workers table, ' ||
  'automatically sync changes to HR domain (employees, contracts)';

-- ============================================================================
-- Phase 5: Create deprecation tracking view
-- ============================================================================

CREATE OR REPLACE VIEW public.migration_status AS
WITH field_stats AS (
  SELECT
    worker_field_name,
    hr_table_name || '.' || hr_column_name AS new_location,
    removal_target_date,
    status,
    CASE
      WHEN removal_target_date IS NULL THEN 'permanent'
      WHEN removal_target_date <= CURRENT_DATE THEN 'overdue'
      WHEN removal_target_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'urgent'
      ELSE 'scheduled'
    END AS removal_urgency
  FROM public.deprecated_worker_fields
  ORDER BY removal_target_date DESC NULLS LAST
)
SELECT * FROM field_stats;

COMMENT ON VIEW public.migration_status IS 
  'Overview of field deprecation status and removal timelines. ' ||
  'Use to track migration progress and plan development work.';

GRANT SELECT ON public.migration_status TO authenticated;

-- ============================================================================
-- Phase 6: Documentation comments
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SAFE DEPRECATION SCHEMA INSTALLED ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Compatibility views created:';
  RAISE NOTICE '  1. workers_legacy_view - Drop-in replacement for workers table SELECT';
  RAISE NOTICE '  2. workers_with_compensation - Includes current pay rates';
  RAISE NOTICE '  3. workers_full_profile - Complete profile with contracts, skills, leave';
  RAISE NOTICE '';
  RAISE NOTICE 'Migration helper functions:';
  RAISE NOTICE '  - get_worker_id_by_employee_id(employee_id) - UUID conversion';
  RAISE NOTICE '  - get_employee_id_by_worker_id(worker_id) - UUID conversion';
  RAISE NOTICE '  - deprecation_warning(field_name) - Get migration guidance';
  RAISE NOTICE '';
  RAISE NOTICE 'This is NON-BREAKING:';
  RAISE NOTICE '  ✓ All legacy worker data preserved';
  RAISE NOTICE '  ✓ Updates to workers auto-sync to HR domain';
  RAISE NOTICE '  ✓ Backward-compatible queries via views';
  RAISE NOTICE '  ✓ Application code can migrate gradually';
  RAISE NOTICE '';
  RAISE NOTICE 'MIGRATION STRATEGY:';
  RAISE NOTICE '  Phase 1 (Now):   Replace SELECT queries with compatibility views';
  RAISE NOTICE '  Phase 2 (30 days): Update INSERT/UPDATE to use employees table directly';
  RAISE NOTICE '  Phase 3 (60 days): Remove performance metrics fields (analytics table)';
  RAISE NOTICE '  Phase 4 (90 days): Deprecate attendance fields (leave tracking)';
  RAISE NOTICE '  Phase 5 (180 days): Remove workers table (if no legacy code remains)';
  RAISE NOTICE '';
  RAISE NOTICE 'Check migration progress:';
  RAISE NOTICE '  SELECT * FROM public.migration_status;';
  RAISE NOTICE '';
  RAISE NOTICE 'View deprecation details:';
  RAISE NOTICE '  SELECT * FROM public.deprecated_worker_fields;';
  RAISE NOTICE '';
END $$;

# HR Domain Migration Guide

## Overview
This guide walks through applying the HR domain migrations that transform the workforce management system from a simple `workers` table to a comprehensive Human Resources domain with employees, contracts, compensation, skills, leave, and incentives.

## Migration Files (Apply in Order)

### 1. Core Tables Migration
**File**: `20260221143000_hr_domain_core_tables.sql`  
**Purpose**: Creates all HR domain tables, enums, constraints, indexes, triggers, and RLS policies

**Tables Created**:
- `employees` - Master employee profile
- `employment_contracts` - Terms of employment with legal limits
- `compensation_rates` - Effective-dated pay rates with OT multipliers
- `skills` - Organization skill catalog
- `employee_skills` - Employee proficiency mapping
- `leave_balances` - Vacation/sick leave tracking
- `leave_requests` - Leave request workflow
- `incentive_rules` - Bonus/penalty definitions
- `employee_incentives` - Awarded incentives

**Enums Created**:
- `employee_status`: active, on_leave, terminated
- `employment_contract_type`: permanent, temporary, seasonal
- `hr_leave_type`: annual_leave, sick_leave, unpaid_leave, parental_leave
- `leave_request_status`: pending, approved, rejected, cancelled
- `incentive_rule_type`: attendance_bonus, performance_bonus, overtime_bonus, penalty_adjustment
- `incentive_award_status`: pending, approved, paid, cancelled

**Apply Command**:
```bash
supabase db push --db-url <your-db-url>
# Or if running locally:
supabase migration up --local
```

**Verification**:
```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('employees', 'employment_contracts', 'compensation_rates', 'skills', 'employee_skills', 'leave_balances', 'leave_requests', 'incentive_rules', 'employee_incentives')
ORDER BY table_name;

-- Should return 9 rows
```

---

### 2. Seed Data Migration
**File**: `20260221143100_hr_domain_seed_data.sql`  
**Purpose**: Adds initial skills catalog and incentive rules

**Data Inserted**:
- 12 core skills (offset press, guillotine, die cutting, pre-press, color management, manual workshop, quality inspection, maintenance, forklift, team leadership)
- 5 incentive rules (attendance bonus, quality bonus, standard OT premium, holiday OT premium, tardiness penalty)

**Apply Command**:
```bash
# This runs automatically after core tables migration if using supabase db push
# Or apply manually:
psql <your-db-url> -f supabase/migrations/20260221143100_hr_domain_seed_data.sql
```

**Verification**:
```sql
-- Check skills loaded
SELECT COUNT(*) FROM public.skills WHERE is_active = true;
-- Should return 12

-- Check incentive rules loaded
SELECT COUNT(*) FROM public.incentive_rules WHERE is_active = true;
-- Should return 5
```

---

### 3. Pre-Migration Integrity Check
**File**: `20260221143150_pre_migration_integrity_check.sql`  
**Purpose**: Validate data quality BEFORE backfill migration to identify issues

**What It Checks:**
- Workers have valid names (not NULL/empty)
- Workers have departments assigned
- No duplicate worker names (email collision prevention)
- Valid timestamps in created_at
- Worker assignments reference existing workers
- Department and overtime availability distribution
- Name parsing preview (first/last name split)
- Email collision detection
- Pre-existing HR data (idempotency check)

**This is a READ-ONLY check** - it does not modify data.

**Apply Command**:
```bash
# Run as standalone query
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/migrations/20260221143150_pre_migration_integrity_check.sql

# Or include in migration push (will execute in order)
supabase db push
```

**Verification**:
```
=== WORKERS TABLE VALIDATION ===
Total workers found: 45
✓ All workers have names
✓ All workers have departments
✓ All worker names are unique
...

=== PRE-MIGRATION CHECK COMPLETE ===
If all checks pass, proceed with backfill migration.
```

---

### 4. Backfill Migration
**File**: `20260221143200_hr_backfill_workers_to_employees.sql`  
**Purpose**: Transfer existing workers data to HR domain and establish dual-write compatibility

**IMPORTANT:** Run pre-migration check (file 143150) first!

**Detailed Guide:** See [HR_BACKFILL_GUIDE.md](HR_BACKFILL_GUIDE.md) for complete step-by-step instructions.

**Quick Summary:**

#### Non-Overlapping Constraints
- Prevents overlapping contract periods for the same employee using PostgreSQL exclusion constraints
- Prevents overlapping compensation rates using daterange overlap detection
- Treats NULL end dates as open-ended (9999-12-31)

#### Helper Functions Created:
- `get_contract_at_date(employee_id, date)` - Retrieve active contract at any date
- `get_compensation_at_date(employee_id, date)` - Retrieve active rate at any date
- `calculate_payroll_for_assignment(...)` - Calculate pay with historical rates (base, OT50, OT100, night, weekend)
- `calculate_payroll_for_period(employee_id, start_date, end_date)` - Aggregate payroll over date range
- `get_compensation_history(employee_id)` - Audit trail with rate changes and percentages
- `get_contract_history(employee_id)` - Contract changes with duration
- `validate_contract_coverage(employee_id, from_date, to_date)` - Check for employment gaps

#### Validation Triggers:
- Warns when compensation rates are set without corresponding employment contracts

**Apply Command**:
```bash
supabase migration up --local
```

**Verification**:
```sql
-- Test non-overlapping constraint (should fail)
INSERT INTO public.compensation_rates (employee_id, effective_from, hourly_rate)
SELECT id, '2024-01-01', 20.00 FROM public.employees LIMIT 1;

INSERT INTO public.compensation_rates (employee_id, effective_from, hourly_rate)
SELECT id, '2024-01-15', 22.00 FROM public.employees LIMIT 1;
-- This should FAIL if first period has NULL effective_to

-- Test historical rate query
SELECT * FROM public.get_compensation_at_date(
  (SELECT id FROM public.employees LIMIT 1),
  '2024-06-15'::date
);

-- Test payroll calculation
SELECT * FROM public.calculate_payroll_for_assignment(
  (SELECT id FROM public.employees LIMIT 1),
  CURRENT_DATE,
  8,    -- regular hours
  4,    -- OT 50% hours
  0,    -- OT 100% hours
  0, 0  -- night/weekend hours
);
```

---

### 4. Backfill Migration
**File**: `20260221143200_hr_backfill_workers_to_employees.sql`  
**Purpose**: Transfer existing workers data to HR domain and establish dual-write compatibility

**What It Does**:

#### Phase 1: Create Employees from Workers
- Generates employee numbers (EMP-00001, EMP-00002, etc.)
- Splits `workers.name` into first/last name
- Creates placeholder emails (`john.doe@workshop.local`)
- Sets hire date from worker creation date
- Preserves `worker.id` in `employee.worker_legacy_id` for backward compatibility

#### Phase 2: Create Employment Contracts
- Creates permanent contracts for all employees
- Sets standard limits:
  - 8 hours per day
  - 40 hours per week
  - 11 hours minimum rest between shifts
- Preserves `overtime_availability` from workers table

#### Phase 3: Create Compensation Rates
- Sets base hourly rate to **$15.00** (adjust for your org)
- Sets OT multiplier to 1.50 (standard +50%)
- Effective from hire date

#### Phase 4: Create Leave Balances
- Annual leave: 80 hours initial, accrue 10/month, max 200
- Sick leave: 40 hours initial, accrue 5/month, max 80

#### Phase 5: Add `employee_id` to `worker_assignments`
- Adds new column to link assignments to employees
- Backfills `employee_id` for all existing assignments
- Creates index for performance

#### Phase 6: Auto-Sync Trigger
- Creates trigger to automatically set `employee_id` when `worker_id` is assigned
- Enables dual-write pattern during transition

#### Phase 7: Compatibility View
- Creates `employee_worker_view` joining employee HR data with legacy worker performance metrics
- Use this view for reporting during transition period

**Apply Command**:
```bash
supabase migration up --local
# Or for remote:
supabase db push
```

**Verification**:
```sql
-- Check employees created equal workers count
SELECT 
  (SELECT COUNT(*) FROM public.workers) as worker_count,
  (SELECT COUNT(*) FROM public.employees) as employee_count,
  (SELECT COUNT(*) FROM public.employment_contracts) as contract_count,
  (SELECT COUNT(*) FROM public.compensation_rates) as rate_count;

-- Check employee_id backfilled in assignments
SELECT COUNT(*) FROM public.worker_assignments WHERE employee_id IS NULL;
-- Should return 0

-- Test compatibility view
SELECT * FROM employee_worker_view LIMIT 5;
```

---

## Post-Migration Steps

### 1. Generate TypeScript Types
After applying migrations, regenerate Supabase types:

```bash
supabase gen types typescript --local > src/integrations/supabase/types.ts
# Or for remote:
supabase gen types typescript --project-id <your-project-id> > src/integrations/supabase/types.ts
```

### 2. Update Data Layer (Prompt 3 from Roadmap)
Create React Query hooks for HR entities in `src/hooks/use-queries.ts`:

- `useEmployees()`
- `useEmployeeContracts(employeeId)`
- `useCompensationRates(employeeId)`
- `useEmployeeSkills(employeeId)`
- `useLeaveBalances(employeeId)`
- `useLeaveRequests(employeeId, status?)`
- `useIncentiveRules()`
- `useEmployeeIncentives(employeeId)`

### 3. Update API Routes
Refactor API middleware in `src/lib/api-middleware.ts` to:
- Use `employee_id` alongside `worker_id` during transition
- Add validation helpers for contract limits (max daily/weekly hours, rest periods)
- Enforce overtime eligibility from `employment_contracts` table

### 4. Update Workflow Dashboard
Modify `src/page-components/WorkflowDashboard.tsx`:
- Query `employee_worker_view` instead of direct workers table
- Display hourly rates and OT multipliers from `compensation_rates`
- Check contract `is_overtime_eligible` before allowing OT assignments
- Show employee skills with proficiency badges

### 5. Create HR Management UI
Build new pages for HR operations:
- **Employee Profile**: View/edit personal info, contracts, compensation history
- **Skills Matrix**: Assign skills with proficiency levels, track certifications
- **Leave Management**: Request/approve leave, view balances
- **Incentives Dashboard**: Award bonuses, track payroll adjustments

---

## Rollback Plan

If issues arise, migrations can be rolled back in reverse order:

```sql
-- Rollback backfill (Phase 7 → 1)
DROP VIEW IF EXISTS employee_worker_view;
DROP TRIGGER IF EXISTS sync_employee_id_on_worker_assignment ON public.worker_assignments;
DROP FUNCTION IF EXISTS public.sync_worker_assignment_employee_id();
ALTER TABLE public.worker_assignments DROP COLUMN IF EXISTS employee_id;
DELETE FROM public.leave_balances;
DELETE FROM public.compensation_rates;
DELETE FROM public.employment_contracts;
DELETE FROM public.employees;

-- Rollback seed data
DELETE FROM public.employee_incentives;
DELETE FROM public.incentive_rules;
DELETE FROM public.employee_skills;
DELETE FROM public.skills;

-- Rollback core tables
DROP TABLE IF EXISTS public.employee_incentives;
DROP TABLE IF EXISTS public.incentive_rules;
DROP TABLE IF EXISTS public.leave_requests;
DROP TABLE IF EXISTS public.leave_balances;
DROP TABLE IF EXISTS public.employee_skills;
DROP TABLE IF EXISTS public.skills;
DROP TABLE IF EXISTS public.compensation_rates;
DROP TABLE IF EXISTS public.employment_contracts;
DROP TABLE IF EXISTS public.employees;
DROP TYPE IF EXISTS incentive_award_status;
DROP TYPE IF EXISTS incentive_rule_type;
DROP TYPE IF EXISTS leave_request_status;
DROP TYPE IF EXISTS hr_leave_type;
DROP TYPE IF EXISTS employment_contract_type;
DROP TYPE IF EXISTS employee_status;
```

---

## Data Quality Checks

After migration, run these queries to verify data integrity:

### Check for Orphaned Records
```sql
-- Workers without employees
SELECT w.* FROM public.workers w
LEFT JOIN public.employees e ON e.worker_legacy_id = w.id
WHERE e.id IS NULL;

-- Assignments without employee_id
SELECT wa.* FROM public.worker_assignments wa
WHERE wa.employee_id IS NULL;
```

### Check for Contract Gaps
```sql
-- Active employees without current contracts
SELECT e.employee_number, e.first_name, e.last_name
FROM public.employees e
WHERE e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.employment_contracts ec
    WHERE ec.employee_id = e.id
      AND ec.start_date <= CURRENT_DATE
      AND (ec.end_date IS NULL OR ec.end_date >= CURRENT_DATE)
  );
```

### Check for Compensation Issues
```sql
-- Employees without current compensation rates
SELECT e.employee_number, e.first_name, e.last_name
FROM public.employees e
WHERE e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.compensation_rates cr
    WHERE cr.employee_id = e.id
      AND cr.effective_from <= CURRENT_DATE
      AND (cr.effective_to IS NULL OR cr.effective_to >= CURRENT_DATE)
  );
```

### Check for Invalid OT Assignments
```sql
-- Worker assignments marked as overtime but employee not eligible
SELECT wa.*, e.employee_number, ec.is_overtime_eligible
FROM public.worker_assignments wa
JOIN public.employees e ON wa.employee_id = e.id
JOIN public.employment_contracts ec ON ec.employee_id = e.id
WHERE wa.role ILIKE '%overtime%'
  AND ec.is_overtime_eligible = false
  AND (ec.end_date IS NULL OR ec.end_date >= wa.date);
```

---

## Using Effective-Date Features

### Historical Payroll Calculation

Calculate payroll for past periods using historically accurate rates:

```sql
-- Get payroll for January 2025 (uses rates that were active then)
SELECT * FROM public.calculate_payroll_for_period(
  'employee-uuid-here',
  '2025-01-01'::date,
  '2025-01-31'::date
);

-- Returns:
-- total_regular_hours | total_overtime_hours | total_pay | assignments_count | breakdown (JSONB)
```

### Query Historical Contract Terms

Check what contract terms were in effect at any past date:

```typescript
// In your application code
const getContractAtDate = async (employeeId: string, date: string) => {
  const { data } = await supabase
    .rpc('get_contract_at_date', {
      p_employee_id: employeeId,
      p_date: date
    });
  return data;
};

// Check if overtime was allowed on specific date
const contract = await getContractAtDate(employeeId, '2025-06-15');
console.log(contract.overtime_allowed); // true/false at that date
```

### Audit Compensation Changes

Track all salary changes with automatic percentage calculations:

```sql
-- View compensation history with raise percentages
SELECT * FROM public.get_compensation_history('employee-uuid');

-- Returns:
-- effective_from | effective_to | hourly_rate | rate_change_amount | rate_change_percent | days_active
-- 2025-03-01     | NULL         | 18.50       | 3.50               | 23.33               | 325
-- 2024-06-01     | 2025-02-28   | 15.00       | NULL               | NULL                | 273
```

### Validate Employment Continuity

Ensure no gaps in employment contracts (important for benefits eligibility):

```sql
-- Check if employee had continuous coverage in 2025
SELECT * FROM public.validate_contract_coverage(
  'employee-uuid',
  '2025-01-01'::date,
  '2025-12-31'::date
);

-- Returns:
-- has_complete_coverage | days_with_coverage | days_expected | coverage_gaps (JSONB)
-- false                 | 345                | 365           | [{"start_date": "2025-07-15", "end_date": "2025-08-03", "days": 20}]
```

### Planning with Effective Dates

When planning future rate changes, the system prevents overlaps:

```sql
-- Create future rate effective March 1, 2026
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,  -- Close current rate on Feb 28
  hourly_rate,
  overtime_multiplier_50
) VALUES (
  '...',
  '2026-03-01',
  NULL,  -- Open-ended (current rate going forward)
  19.50,
  1.50
);

-- System will reject if this overlaps with existing rate period
```

### Retroactive Corrections

If you discover a payroll error, you can correct historical rates:

```sql
-- Update past compensation rate (closes it earlier)
UPDATE public.compensation_rates
SET effective_to = '2025-06-30'
WHERE employee_id = 'employee-uuid'
  AND effective_from = '2025-01-01';

-- Insert corrected rate for that period
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,
  hourly_rate,
  overtime_multiplier_50
) VALUES (
  'employee-uuid',
  '2025-07-01',
  '2025-12-31',
  18.00,  -- Corrected rate
  1.50
);

-- Recalculate payroll for affected period
SELECT * FROM public.calculate_payroll_for_period(
  'employee-uuid',
  '2025-07-01'::date,
  '2025-07-31'::date
);
```

---

## Effective-Date Constraint Behavior

### Non-Overlapping Enforcement

The system uses PostgreSQL exclusion constraints to prevent overlapping effective date ranges:

**What This Means:**
- You cannot have two active contracts for the same employee at the same time
- You cannot have two different hourly rates effective on the same date
- NULL end dates are treated as "forever" (9999-12-31)

**Common Scenarios:**

#### ❌ Scenario 1: Adding overlapping contract
```sql
-- Employee has contract: 2025-01-01 to NULL (ongoing)
-- Trying to add: 2025-06-01 to NULL
-- Result: FAILS - dateranges [2025-01-01, 9999-12-31] and [2025-06-01, 9999-12-31] overlap
```

**✅ Solution:** Close the first contract before the new one starts
```sql
-- First, close existing contract
UPDATE public.employment_contracts
SET end_date = '2025-05-31'
WHERE employee_id = 'employee-uuid' AND end_date IS NULL;

-- Then add new contract
INSERT INTO public.employment_contracts (
  employee_id, start_date, contract_type, ...
) VALUES (
  'employee-uuid', '2025-06-01', 'full_time', ...
);
```

#### ❌ Scenario 2: Rate change without closing current rate
```sql
-- Employee has rate: 2025-01-01 to NULL @ $15/hr
-- Trying to add: 2026-03-01 to NULL @ $18/hr
-- Result: FAILS - both have NULL effective_to
```

**✅ Solution:** Close previous rate at transition date
```sql
-- Transaction to ensure atomicity
BEGIN;

-- Close current rate
UPDATE public.compensation_rates
SET effective_to = '2026-02-29'
WHERE employee_id = 'employee-uuid' AND effective_to IS NULL;

-- Add new rate starting next day
INSERT INTO public.compensation_rates (
  employee_id, effective_from, hourly_rate, ...
) VALUES (
  'employee-uuid', '2026-03-01', 18.00, ...
);

COMMIT;
```

#### ✅ Scenario 3: Planned transition
```sql
-- Create both records with explicit end/start dates
-- Current rate: effective until Feb 28
INSERT INTO public.compensation_rates (
  employee_id, effective_from, effective_to, hourly_rate
) VALUES (
  'employee-uuid', '2025-01-01', '2026-02-28', 15.00
);

-- New rate: effective from Mar 1 onward
INSERT INTO public.compensation_rates (
  employee_id, effective_from, effective_to, hourly_rate
) VALUES (
  'employee-uuid', '2026-03-01', NULL, 18.00
);
-- SUCCESS - no overlap
```

### Checking for Overlaps Beforedefining

Before inserting, check if a date range overlaps:

```sql
-- Check if date range is available
SELECT EXISTS (
  SELECT 1 FROM public.compensation_rates
  WHERE employee_id = 'employee-uuid'
    AND daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')
      && daterange('2026-03-01'::date, '9999-12-31'::date, '[]')
) as has_overlap;
```

### Gap vs Overlap Trade-off

**Overlaps are prevented** (constraint enforced)  
**Gaps are allowed** (but can be detected via `validate_contract_coverage`)

This design choice means:
- ✅ You cannot accidentally have two rates active simultaneously
- ⚠️ You CAN have gaps where no rate exists (must validate manually)

Use `validate_contract_coverage()` and `validate_compensation_coverage()` to detect gaps before running payroll.

---

## Configuration Adjustments

### Adjust Base Compensation Rate
Default is $15.00 USD. To change:

```sql
UPDATE public.compensation_rates
SET hourly_rate = 18.50  -- Your organization's base rate
WHERE notes LIKE '%created during migration%';
```

### Adjust Leave Accrual Rates
Default is 10 hours/month annual, 5 hours/month sick:

```sql
UPDATE public.leave_balances
SET accrual_rate_per_month = 15  -- New accrual rate
WHERE leave_type = 'annual_leave';
```

### Add Custom Skills
```sql
INSERT INTO public.skills (code, name, description, category, is_active)
VALUES 
  ('DIGITAL_PRESS', 'Digital Press Operation', 'Operation of digital printing equipment', 'printing', true),
  ('BINDERY', 'Binding & Finishing', 'Book binding and finishing operations', 'finishing', true);
```

---

## Performance Considerations

### Indexes Created
The migrations include these indexes for optimal query performance:

- `idx_employees_worker_legacy_id` - Fast lookup from workers to employees
- `idx_employees_status` - Filter by employment status
- `idx_employment_contracts_employee_effective` - Current contract lookups
- `idx_compensation_rates_employee_effective` - Current pay rate lookups
- `idx_employee_skills_employee_id` - Employee skill queries
- `idx_leave_balances_employee_type` - Leave balance queries
- `idx_leave_requests_employee_status` - Leave request filtering
- `idx_employee_incentives_employee_status` - Incentive tracking
- `idx_worker_assignments_employee_id` - Assignment queries by employee

### Query Optimization Tips

**Instead of querying multiple tables separately:**
```typescript
// ❌ Inefficient
const employee = await query.employees.get(id);
const contract = await query.contracts.getCurrent(id);
const rate = await query.compensation.getCurrent(id);
```

**Use the compatibility view:**
```typescript
// ✅ Efficient
const employeeData = await query.from('employee_worker_view')
  .select('*')
  .eq('employee_id', id)
  .single();
```

---

## Security Notes

### RLS Policies Applied
All HR tables have Row-Level Security enabled with these policies:

- **All authenticated users** can SELECT (read) all records
- **Supervisors and Admins** can INSERT/UPDATE/DELETE
- Uses `has_role(auth.uid(), 'supervisor')` function for role checks

### Sensitive Data Protection
Currently, email and phone are not considered sensitive. If you need to restrict access:

```sql
-- Example: Restrict compensation data to managers only
DROP POLICY "Authenticated users can view compensation_rates" ON public.compensation_rates;
CREATE POLICY "Managers can view compensation rates"
  ON public.compensation_rates FOR SELECT
  USING (has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'admin'));
```

---

## Troubleshooting

### Issue: Migration fails with "function has_role does not exist"
**Solution**: Ensure you've applied earlier migrations that create the `has_role` function.

### Issue: Cannot insert employment contract - overlapping dates
**Error**: `conflicting key value violates exclusion constraint "employment_contracts_no_overlap"`  
**Cause**: Trying to create a contract that overlaps with an existing active contract  
**Solution**: 
1. Check existing contracts: `SELECT * FROM employment_contracts WHERE employee_id = 'uuid' ORDER BY start_date;`
2. Close the current contract with `end_date` before the new contract's `start_date`
3. Or adjust your new contract's `start_date` to begin after existing contract ends

### Issue: Cannot insert compensation rate - overlapping dates
**Error**: `conflicting key value violates exclusion constraint "compensation_rates_no_overlap"`  
**Cause**: Trying to create a rate that overlaps with an existing rate  
**Solution**: Use a transaction to close old rate and open new rate atomically:
```sql
BEGIN;
UPDATE public.compensation_rates 
SET effective_to = '2026-02-29' 
WHERE employee_id = 'uuid' AND effective_to IS NULL;

INSERT INTO public.compensation_rates (employee_id, effective_from, hourly_rate)
VALUES ('uuid', '2026-03-01', 18.50);
COMMIT;
```

### Issue: Payroll calculation returns NULL
**Error**: `No compensation rate found for employee X at date Y`  
**Cause**: Employee has no compensation rate defined for the assignment date  
**Solution**: 
1. Check rates: `SELECT * FROM get_compensation_at_date('employee-uuid', '2025-06-15')`
2. If missing, insert a rate with `effective_from <= assignment_date`

### Issue: Historical payroll shows wrong amounts
**Cause**: Compensation rate was retroactively changed without proper effective dating  
**Solution**: 
1. Query history: `SELECT * FROM get_compensation_history('employee-uuid')`
2. Verify rate periods align with actual work dates
3. If needed, insert historical correction rates with proper `effective_from/to` dates
4. Recalculate: `SELECT * FROM calculate_payroll_for_period('uuid', start, stop)`

### Issue: Trigger sync fails silently
**Check**: Look for function execution errors:
```sql
SELECT * FROM pg_stat_statements WHERE query LIKE '%sync_worker_assignment_employee_id%';
```

### Issue: Employee numbers not sequential
**Cause**: Concurrent inserts or deleted workers  
**Fix**: Regenerate employee numbers:
```sql
WITH numbered_employees AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY hire_date, created_at) as rn
  FROM public.employees
)
UPDATE public.employees e
SET employee_number = 'EMP-' || LPAD(ne.rn::TEXT, 5, '0')
FROM numbered_employees ne
WHERE e.id = ne.id;
```

---

## Next Steps

After successful migration:

1. ✅ Apply migrations (completed)
2. ⏭️ Generate TypeScript types
3. ⏭️ Create React Query hooks for HR entities (Prompt 3)
4. ⏭️ Add validation helpers for legal limits (Prompt 5)
5. ⏭️ Refactor workflow UI to use employee data (Prompt 6-7)
6. ⏭️ Build HR management pages (Prompt 8-12)
7. ⏭️ Integrate skills into scheduling (Prompt 13-14)
8. ⏭️ Add leave constraints to workflow (Prompt 15)
9. ⏭️ Build payroll-ready overtime reports (Prompt 16-17)

See [35-prompt roadmap](./HR_DOMAIN_MIGRATION_AUDIT.md#implementation-roadmap) for complete sequence.

---

## Support

For issues or questions:
- Review [HR_DOMAIN_MIGRATION_AUDIT.md](./HR_DOMAIN_MIGRATION_AUDIT.md) for architectural decisions
- Check Supabase logs: `supabase functions logs`
- Verify RLS policies are not blocking operations
- Ensure `auth.uid()` returns valid user ID in authenticated context

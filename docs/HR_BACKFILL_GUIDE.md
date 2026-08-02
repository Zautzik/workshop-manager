# HR Domain Backfill Migration Guide

Complete guide to safely migrating workers to the HR domain with data integrity checks.

## Overview

This guide walks through the 3-phase migration process:
1. **Pre-migration checks** - Validate data quality BEFORE migration
2. **Backfill migration** - Transfer data from workers to HR tables
3. **Post-migration verification** - Validate migration success

## Migration Files

| Order | File | Purpose | Safe to Re-run? |
|-------|------|---------|-----------------|
| 1 | `20260221143150_pre_migration_integrity_check.sql` | Data quality validation | ✓ Yes (read-only) |
| 2 | `20260221143200_hr_backfill_workers_to_employees.sql` | Data transfer & backfill | ✓ Yes (idempotent) |
| 3 | `20260221143250_post_migration_verification.sql` | Success verification | ✓ Yes (read-only) |

---

## Step-by-Step Procedure

### Step 1: Pre-Migration Integrity Check

**Purpose**: Identify data quality issues BEFORE migrating to prevent failures.

**Run:**
```bash
# If using Supabase CLI locally
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/migrations/20260221143150_pre_migration_integrity_check.sql

# Or if already applied core tables, just query
supabase db push  # Should skip if no new migrations
```

**What It Checks:**
- ✓ Workers have valid names (not NULL/empty)
- ✓ Workers have departments assigned
- ✓ No duplicate worker names (to avoid email conflicts)
- ✓ Valid created_at timestamps
- ✓ Worker assignments reference existing workers
- ✓ Department distribution analysis
- ✓ Overtime eligibility distribution
- ✓ Name parsing preview (how first/last names will be split)
- ✓ Email collision detection
- ✓ Whether HR tables already contain data

**Expected Output:**
```
=== WORKERS TABLE VALIDATION ===
Total workers found: 45
✓ All workers have names
✓ All workers have departments
✓ All worker names are unique
✓ All created_at dates are valid

=== WORKER ASSIGNMENTS VALIDATION ===
Total assignments found: 1247
✓ All assignments have valid worker references

=== DEPARTMENT ANALYSIS ===
  Printing              - 18 workers
  Cutting               - 12 workers
  Workshop              - 10 workers
  Manual                - 5 workers

=== OVERTIME AVAILABILITY ANALYSIS ===
  NULL (will default to eligible): 0
  Eligible: 42
  Not eligible: 3

=== NAME PARSING PREVIEW ===
✓ All workers have multi-word names

Sample name parsing (first 5):
  John Smith -> John, Smith (john.smith@workshop.local)
  Maria Garcia -> Maria, Garcia (maria.garcia@workshop.local)
  ...

=== EMAIL COLLISION DETECTION ===
✓ No email collisions expected

=== PRE-EXISTING HR DATA CHECK ===
✓ HR tables are empty (clean migration)

=== PRE-MIGRATION CHECK COMPLETE ===
```

**If Issues Found:**

❌ **Workers with missing names:**
```sql
-- Fix before migration
UPDATE workers SET name = 'Worker ' || id WHERE name IS NULL OR TRIM(name) = '';
```

❌ **Workers with missing departments:**
```sql
-- Assign default department
UPDATE workers SET department = 'General' WHERE department IS NULL OR TRIM(department) = '';
```

❌ **Duplicate names causing email collisions:**
```sql
-- Option 1: Add numbers to duplicates
UPDATE workers SET name = name || ' ' || ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at)
WHERE name IN (SELECT name FROM workers GROUP BY name HAVING COUNT(*) > 1);

-- Option 2: Handle in migration (see below)
```

❌ **Orphaned assignments:**
```sql
-- Delete assignments for non-existent workers
DELETE FROM worker_assignments WHERE worker_id NOT IN (SELECT id FROM workers);
```

---

### Step 2: Run Backfill Migration

**Purpose**: Transfer all workers data to HR domain tables.

**Run:**
```bash
# Apply migration
supabase migration up --local

# Or push all pending migrations
supabase db push
```

**What It Does:**

**Phase 1: Create Employees**
- Generates employee numbers (EMP-00001, EMP-00002, ...)
- Splits worker names into first/last names
- Creates placeholder emails (john.smith@workshop.local)
- Sets hire date from worker creation date
- Links to legacy worker via `worker_legacy_id`

**Phase 2: Create Employment Contracts**
- Creates one permanent contract per employee
- Sets standard limits (8 hrs/day, 40 hrs/week)
- Preserves overtime_availability from workers table
- Uses hire date as contract start date

**Phase 3: Create Compensation Rates**
- Sets base rate to **$15.00/hr** (customizable)
- Sets OT multiplier to 1.50 (time-and-a-half)
- Effective from hire date
- Creates one rate per employee

**Phase 4: Create Leave Balances**
- Creates vacation leave (80 hrs initial, 10/month accrual, 200 max)
- Creates sick leave (40 hrs initial, 5/month accrual, 80 max)
- Only for active employees

**Phase 5: Backfill worker_assignments**
- Adds `employee_id` column to worker_assignments
- Backfills employee_id based on worker_id
- Creates index for performance

**Phase 6: Create Auto-Sync Trigger**
- Automatically sets employee_id when worker_id is assigned
- Enables dual-write pattern during transition

**Phase 7: Create Compatibility View**
- Creates `employee_worker_view` joining HR + legacy data
- Use for reporting during transition period

**Phase 8: Final Integrity Checks**
- Validates all employees have contracts
- Validates all employees have compensation
- Reports success/failure

**Expected Output:**
```
Starting HR domain backfill for 45 workers...
✓ Pre-flight validation passed

Phase 1 complete: 45 employees created from 45 workers
Phase 2 complete: 45 employment contracts created for 45 employees
Phase 3 complete: 45 compensation rates created for 45 employees
Phase 4 complete: 90 leave balances created for 45 active employees
Phase 5 complete: 1247 of 1247 assignments backfilled with employee_id
✓ All assignments have employee_id
Phase 7 complete: employee_worker_view created

=== FINAL DATA INTEGRITY CHECKS ===
✓ All integrity checks passed

HR Domain Backfill Summary:
- Workers in legacy table: 45
- Employees created: 45
- Employment contracts created: 45
- Compensation rates created: 45
- Leave balances created: 90

✓ Employee count matches worker count
✓✓✓ BACKFILL MIGRATION SUCCESSFUL ✓✓✓

All workers successfully migrated to HR domain.

NEXT STEPS:
1. Run post-migration verification: 20260221143250_post_migration_verification.sql
2. Generate TypeScript types: supabase gen types typescript --local > src/integrations/supabase/types.ts
3. Create React Query hooks for HR entities (see HR_MIGRATION_GUIDE.md)
4. Begin dual-write phase: use both worker_id and employee_id in assignments
5. Update application to query employee_worker_view for reports
```

**Migration is Idempotent:**
- Safe to run multiple times
- Uses `ON CONFLICT DO NOTHING` to skip existing records
- Checks `NOT EXISTS` before inserting related records

---

### Step 3: Post-Migration Verification

**Purpose**: Comprehensive validation that migration succeeded.

**Run:**
```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/migrations/20260221143250_post_migration_verification.sql
```

**What It Checks:**

✓ **Record Count Matching**
- Employees = Workers count
- One contract per employee
- One compensation rate per employee
- Two leave types per active employee

✓ **Foreign Key Integrity**
- All contracts reference valid employees
- All compensation rates reference valid employees
- All leave balances reference valid employees
- All employees reference valid legacy workers

✓ **worker_assignments Dual-Write Setup**
- All assignments have employee_id populated
- employee_id matches worker_legacy_id correctly

✓ **Trigger Functionality**
- Auto-sync trigger exists and is enabled

✓ **Data Quality**
- No employees without contracts
- No employees without compensation
- No active employees without leave balances
- All date ranges are valid (end > start)

✓ **Backward Compatibility View**
- employee_worker_view exists and is queryable
- Returns expected row count

✓ **Sample Data Spot-Check**
- Shows 3 random employees with full HR data
- Validates data looks correct

✓ **Effective-Date Query Test**
- Tests `get_contract_at_date()` works
- Tests `get_compensation_at_date()` works

**Expected Output:**
```
=== RECORD COUNT VERIFICATION ===
Workers: 45
Employees: 45
Contracts: 45
Compensation rates: 45
Leave balances: 90
✓ Employee count matches worker count
✓ One contract per employee created
✓ One compensation rate per employee created
✓ Leave balances created for active employees

=== FOREIGN KEY INTEGRITY ===
✓ All contracts reference valid employees
✓ All compensation rates reference valid employees
✓ All leave balances reference valid employees
✓ All employees reference valid legacy workers

=== WORKER ASSIGNMENTS DUAL-WRITE VERIFICATION ===
Total assignments: 1247
Assignments with employee_id: 1247
Assignments missing employee_id: 0
✓ All assignments have employee_id populated
✓ All employee_id references match worker_id

=== TRIGGER VERIFICATION ===
✓ Auto-sync trigger exists

=== DATA QUALITY CHECKS ===
✓ All employees have employment contracts
✓ All employees have compensation rates
✓ All active employees have leave balances
✓ All contract date ranges are valid
✓ All compensation date ranges are valid

=== BACKWARD COMPATIBILITY VIEW ===
✓ employee_worker_view exists and is queryable
  - View returns 45 rows

=== SAMPLE DATA SPOT-CHECK ===
Showing 3 random employees with their HR data:

---
Employee: EMP-00023 - John Smith
  Department: Printing
  Status: active
  Hire date: 2024-03-15
  Contract: full_time (40.00 hrs/week, OT allowed: t)
  Compensation: USD 15.00/hr (OT: 1.50x)
  Leave types: 2

---
Employee: EMP-00004 - Maria Garcia
  Department: Cutting
  Status: active
  Hire date: 2023-11-20
  Contract: full_time (40.00 hrs/week, OT allowed: t)
  Compensation: USD 15.00/hr (OT: 1.50x)
  Leave types: 2

---
Employee: EMP-00031 - Robert Johnson
  Department: Workshop
  Status: active
  Hire date: 2024-06-01
  Contract: full_time (40.00 hrs/week, OT allowed: t)
  Compensation: USD 15.00/hr (OT: 1.50x)
  Leave types: 2

=== EFFECTIVE-DATE QUERY TEST ===
✓ get_contract_at_date() works
  - Returns contract type: full_time
✓ get_compensation_at_date() works
  - Returns rate: 15.00 USD

=== POST-MIGRATION VERIFICATION COMPLETE ===

Migration success rate: 100.0% (45 of 45 workers migrated)

✓✓✓ MIGRATION SUCCESSFUL ✓✓✓

Next steps:
  1. Review any warnings above
  2. Generate TypeScript types: supabase gen types typescript --local > src/integrations/supabase/types.ts
  3. Create React Query hooks for HR entities
  4. Test effective-date queries in application
  5. Update API routes to use employee_id
```

---

## Customizing the Migration

### Adjust Base Compensation Rate

Default is $15.00/hr. To change before migration:

**Edit the migration file:**
```sql
-- In 20260221143200_hr_backfill_workers_to_employees.sql
-- Line ~90
15.00 as hourly_rate, -- Change this value
```

**Or change after migration:**
```sql
UPDATE public.compensation_rates
SET hourly_rate = 18.50
WHERE notes LIKE '%Base compensation created during migration%';
```

### Customize Leave Balances

**Edit the migration file:**
```sql
-- In 20260221143200_hr_backfill_workers_to_employees.sql
-- Phase 4, around line 130
VALUES 
  ('vacation'::hr_leave_type, 120, 15, 300),  -- 120 initial, 15/month, max 300
  ('sick'::hr_leave_type, 60, 8, 120)         -- 60 initial, 8/month, max 120
```

### Handle Email Collisions

If you have duplicate worker names, modify the email generation:

```sql
-- Add employee number to email for uniqueness
LOWER(REPLACE(w.name, ' ', '.')) || '.' || 
  LPAD((ROW_NUMBER() OVER (ORDER BY w.created_at))::TEXT, 5, '0') || 
  '@workshop.local' as email
```

Result: `john.smith.00123@workshop.local`

### Assign Department-Specific Rates

```sql
-- Replace the flat $15 rate with department-based rates
CASE 
  WHEN w.department = 'Printing' THEN 18.00
  WHEN w.department = 'Cutting' THEN 16.50
  WHEN w.department = 'Workshop' THEN 15.00
  ELSE 14.00
END as hourly_rate
```

---

## Troubleshooting

### Issue: Pre-migration check fails

**Symptom:** Warnings about missing names, departments, or orphaned assignments

**Solution:** Fix data quality issues before proceeding:
```sql
-- See "If Issues Found" section in Step 1 above
```

### Issue: Migration fails midway

**Symptom:** Error during one of the phases

**Cause:** Usually constraint violations or missing foreign keys

**Solution:**
1. Check the error message for which phase failed
2. Migration is idempotent - fix the issue and re-run
3. Already-created records will be skipped (ON CONFLICT DO NOTHING)

### Issue: Employee count doesn't match worker count

**Symptom:** Post-verification shows mismatch

**Possible Causes:**
- Duplicate `worker_legacy_id` (should be impossible due to constraint)
- Workers deleted during migration (check between runs)

**Debug:**
```sql
-- Find workers not migrated
SELECT w.* FROM workers w
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.worker_legacy_id = w.id);

-- Find duplicate legacy IDs
SELECT worker_legacy_id, COUNT(*)
FROM employees
WHERE worker_legacy_id IS NOT NULL
GROUP BY worker_legacy_id
HAVING COUNT(*) > 1;
```

### Issue: Some assignments missing employee_id

**Symptom:** Post-verification shows orphaned assignments

**Cause:** Assignments reference workers that were deleted before migration

**Solution:**
```sql
-- Option 1: Delete orphaned assignments
DELETE FROM worker_assignments
WHERE employee_id IS NULL;

-- Option 2: Manually backfill (if workers can be recovered)
UPDATE worker_assignments wa
SET employee_id = e.id
FROM employees e
WHERE wa.worker_id = e.worker_legacy_id
  AND wa.employee_id IS NULL;
```

### Issue: Effective-date functions fail

**Symptom:** `get_contract_at_date()` or `get_compensation_at_date()` return errors

**Cause:** Functions not created (missed migration file)

**Solution:**
```bash
# Ensure effective-date enhancements migration was applied
supabase db push
```

---

## Rollback Procedure

If you need to undo the migration:

```sql
-- WARNING: This removes all HR data and resets to legacy-only

-- Remove trigger and function
DROP TRIGGER IF EXISTS sync_employee_id_on_worker_assignment ON worker_assignments;
DROP FUNCTION IF EXISTS sync_worker_assignment_employee_id();

-- Remove view
DROP VIEW IF EXISTS employee_worker_view;

-- Remove employee_id from assignments
ALTER TABLE worker_assignments DROP COLUMN IF EXISTS employee_id;

-- Remove HR data (CASCADE removes related records)
DELETE FROM leave_balances;
DELETE FROM compensation_rates;
DELETE FROM employment_contracts;
DELETE FROM employees;

-- Verify rollback
SELECT 
  (SELECT COUNT(*) FROM employees) as employees,
  (SELECT COUNT(*) FROM employment_contracts) as contracts,
  (SELECT COUNT(*) FROM compensation_rates) as compensation,
  (SELECT COUNT(*) FROM leave_balances) as leave_balances;
-- All should return 0
```

---

## Next Steps After Migration

1. **Generate TypeScript Types**
   ```bash
   supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```

2. **Create React Query Hooks** (see HR_MIGRATION_GUIDE.md)
   - `useEmployees()`
   - `useEmployeeContracts()`
   - `useCompensationRates()`
   - etc.

3. **Update API Routes**
   - Start using `employee_id` alongside `worker_id`
   - Query `employee_worker_view` for reports

4. **Test Effective-Date Queries**
   - Verify `get_contract_at_date()` works
   - Test payroll calculations with historical rates

5. **Plan Read-Switch**
   - Transition from workers table to employees table
   - Update workflow UI to use HR data
   - Deprecate worker_legacy_id after full transition

---

## Migration Checklist

- [ ] Read this guide completely
- [ ] Back up database before starting
- [ ] Run pre-migration integrity check (Step 1)
- [ ] Fix any data quality issues identified
- [ ] Customize compensation rates if needed (default $15/hr)
- [ ] Customize leave balances if needed
- [ ] Run backfill migration (Step 2)
- [ ] Verify "MIGRATION SUCCESSFUL" message
- [ ] Run post-migration verification (Step 3)
- [ ] Verify "✓✓✓ MIGRATION SUCCESSFUL ✓✓✓" message
- [ ] Generate TypeScript types
- [ ] Test effective-date query functions
- [ ] Create React Query hooks
- [ ] Update API routes to use employee_id
- [ ] Test in application UI
- [ ] Document any customizations made
- [ ] Celebrate! 🎉

---

## Support Resources

- [HR_MIGRATION_GUIDE.md](HR_MIGRATION_GUIDE.md) - Full HR domain migration guide
- [EFFECTIVE_DATE_PATTERNS.md](EFFECTIVE_DATE_PATTERNS.md) - Query pattern reference
- [EFFECTIVE_DATE_VISUALIZATION.md](EFFECTIVE_DATE_VISUALIZATION.md) - Visual timeline guide
- Migration files: `supabase/migrations/202602211431*.sql`

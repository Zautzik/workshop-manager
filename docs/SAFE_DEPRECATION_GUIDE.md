# Safe Deprecation Strategy for Legacy Worker Fields

Guide to gradually migrating from the legacy `workers` table to the new HR domain while maintaining backward compatibility.

## Overview

This deprecation strategy is **NON-BREAKING**:
- ✅ All legacy `workers` table data preserved
- ✅ Automatic sync from workers table to HR domain
- ✅ Compatibility views for SELECT queries
- ✅ Helper functions for ID conversion
- ✅ Gradual migration over 6 months
- ✅ Application code can transition at own pace

## Why Deprecate Worker Fields?

**Problem:** `workers` table mixed concerns:
- Identity (name, department) → moved to `employees`
- Performance metrics (ratings) → should be in `task_logs` or analytics
- Business rules (overtime) → moved to `employment_contracts`
- Compensation → moved to `compensation_rates`
- Leave/attendance → moved to `leave_balances`

**Solution:** Separate concerns, consolidate HR data in HR domain.

---

## Overview of Field Retirement

| Field | Current Use | New Location | Target Removal | Priority |
|-------|------------|--------------|-----------------|----------|
| `name` | Identity | `employees.full_name` | Permanent* | High |
| `department` | Identity | `employees.department` | Permanent* | High |
| `created_at`, `updated_at` | Audit | `employees` timestamps | Permanent* | High |
| `overtime_availability` | Business rule | `employment_contracts.overtime_allowed` | Permanent* | High |
| `sheets_per_hour` | Performance | `task_logs` or analytics | 2026-12-31 | Medium |
| `overall_rating` | Performance | HR assessments | 2026-12-31 | Medium |
| `quality_score` | Performance | `task_logs.performance_rating` | 2026-12-31 | Medium |
| `speed_score` | Performance | `task_logs` metrics | 2026-12-31 | Medium |
| `teamwork_rating` | Assessment | `employee_skills` + assessments | 2026-12-31 | Medium |
| `attendance_score` | Attendance | `leave_events` tracking | 2026-12-31 | Medium |
| `lateness_minutes` | Attendance | `task_logs` or clock system | 2026-12-31 | Medium |

*Core identity fields (name, dept, timestamps, overtime) are synchronized to HR domain during backfill and will remain accessible via views indefinitely.

---

## Phase 1: View-Based Compatibility (Immediate)

**Objective:** Replace SELECT queries with compatible views without changing business logic.

### Step 1: Replace SELECT * FROM workers

**Before:**
```sql
SELECT * FROM workers WHERE department = 'Printing';
```

**After:**
```sql
SELECT * FROM workers_legacy_view WHERE department = 'Printing';
```

**Benefits:**
- Actual data comes from HR domain (employees, contracts, compensation)
- Legacy field names still work
- Automatic sync of compensation, contract info
- No code logic changes

### Step 2: Use specialized views for reports

Instead of joined SELECT queries, use prebuilt views:

**For performance reports:**
```sql
-- Old way
SELECT w.name, w.overall_rating, w.quality_score
FROM workers w
WHERE updated_at > CURRENT_DATE - INTERVAL '30 days';

-- New way
SELECT name, overall_rating, quality_score
FROM workers_legacy_view
WHERE updated_at > CURRENT_DATE - INTERVAL '30 DAYS';
```

**For compensation reports:**
```sql
-- Includes current hourly rates
SELECT 
  name,
  department,
  hourly_rate,
  overtime_multiplier_50,
  currency_code
FROM workers_with_compensation
WHERE department = 'Printing';
```

**For comprehensive dashboards:**
```sql
-- All data in one query
SELECT *
FROM workers_full_profile
WHERE department IN ('Printing', 'Cutting');
```

### Step 3: Available Views

| View | Purpose | Columns Included |
|------|---------|------------------|
| `workers_legacy_view` | Exact drop-in replacement for workers table | All original worker fields + employee_id |
| `workers_with_compensation` | Legacy data + current pay rates | Legacy fields + hourly_rate, overtime_multipliers, effective dates |
| `workers_full_profile` | Complete worker profile | Legacy + contracts + compensation + skills summary + leave balance |

All views are:
- ✓ Read-only (safe)
- ✓ Updated in real-time
- ✓ Queryable with `WHERE`, `ORDER BY`, etc.
- ✓ Joinable with other tables

---

## Phase 2: Direct HR Domain Usage (30 Days)

**Objective:** Transition INSERT/UPDATE operations to use employees table directly.

### Step 1: Identify update points

Find code that writes to workers table:

```bash
# Search for UPDATE/INSERT on workers
grep -r "UPDATE workers" src/
grep -r "INSERT INTO workers" src/
```

### Step 2: Rewrite worker updates

**Before (legacy pattern):**
```typescript
const updateWorker = async (workerId, data) => {
  const { error } = await supabase
    .from('workers')
    .update({
      name: data.name,
      department: data.department,
      overall_rating: data.rating
    })
    .eq('id', workerId);
  
  return error;
};
```

**After (new pattern - still compatible):**
```typescript
const updateWorker = async (workerId, data) => {
  // Get employee_id from worker_id
  const employeeId = await supabase.rpc('get_employee_id_by_worker_id', {
    p_worker_id: workerId
  });
  
  // Update via HR domain
  const { error } = await supabase
    .from('employees')
    .update({
      full_name: data.name,
      department: data.department,
      updated_at: new Date()
    })
    .eq('id', employeeId);
  
  // Workers table auto-syncs via trigger!
  return error;
};
```

**Best (new pattern - no workers dependency):**
```typescript
const updateWorkerViaHR = async (employeeId, data) => {
  // Use employee_id directly
  const { error } = await supabase
    .from('employees')
    .update({
      full_name: data.name,
      department: data.department
    })
    .eq('id', employeeId);
  
  return error;
};
```

### Step 3: Create new workers via employees table

**Before:**
```typescript
const createWorker = async (name, department) => {
  return supabase
    .from('workers')
    .insert([{ name, department }]);
};
```

**After:**
```typescript
const createWorker = async (name, department) => {
  // Create in HR domain instead
  return supabase
    .from('employees')
    .insert([{
      full_name: name,
      department,
      status: 'active',
      hire_date: new Date()
    }]);
};
```

### Step 4: Helper functions for migration

Use built-in conversion functions:

```typescript
// Get employee ID from worker ID
const getEmployeeId = async (workerId) => {
  const { data } = await supabase.rpc('get_employee_id_by_worker_id', {
    p_worker_id: workerId
  });
  return data;
};

// Get worker ID from employee ID (for legacy reports)
const getWorkerId = async (employeeId) => {
  const { data } = await supabase.rpc('get_worker_id_by_employee_id', {
    p_employee_id: employeeId
  });
  return data;
};
```

---

## Phase 3: Performance Metrics Migration (60 Days)

**Objective:** Move performance tracking out of workers table.

### Current Problem
Performance metrics (sheets_per_hour, quality_score, overall_rating) are static fields. Better approach: track via `task_logs`.

### Migration Path

**Create performance_analytics table:**
```sql
-- Store historical snapshots
CREATE TABLE performance_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  metric_date DATE NOT NULL,
  sheets_per_hour INTEGER,
  quality_score INTEGER,
  speed_score INTEGER,
  assignments_count INTEGER,
  weighted_rating NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_perf_analytics_employee_date 
  ON performance_analytics(employee_id, metric_date DESC);
```

**Populate from task_logs:**
```sql
INSERT INTO performance_analytics (employee_id, metric_date, ...)
SELECT 
  wa.employee_id,
  wa.date,
  AVG(EXTRACT(EPOCH FROM task_duration::interval) / 3600)::INTEGER,  -- hours/volume
  AVG(tl.performance_rating),
  COUNT(*) 
FROM worker_assignments wa
LEFT JOIN task_logs tl ON tl.worker_id = wa.worker_id
GROUP BY wa.employee_id, wa.date;
```

**Create view for legacy compatibility:**
```sql
-- Latest metrics per employee
CREATE OR REPLACE VIEW worker_performance_summary AS
SELECT
  e.worker_legacy_id AS worker_id,
  e.id AS employee_id,
  pa.sheets_per_hour,
  pa.quality_score,
  pa.speed_score,
  pa.weighted_rating AS overall_rating,
  pa.metric_date
FROM employees e
LEFT JOIN LATERAL (
  SELECT * FROM performance_analytics
  WHERE employee_id = e.id
  ORDER BY metric_date DESC
  LIMIT 1
) pa ON true;
```

### Update code to use analytics table:

**Before:**
```typescript
const getWorkerStats = async (workerId) => {
  const { data } = await supabase
    .from('workers')
    .select('sheets_per_hour, quality_score, overall_rating')
    .eq('id', workerId)
    .single();
  
  return data;
};
```

**After:**
```typescript
const getWorkerStats = async (employeeId) => {
  // Get latest performance metrics
  const { data } = await supabase
    .from('performance_analytics')
    .select('sheets_per_hour, quality_score, weighted_rating')
    .eq('employee_id', employeeId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .single();
  
  return data;
};

// Or use view for compatibility
const getWorkerStatsLegacy = async (workerId) => {
  const { data } = await supabase
    .from('worker_performance_summary')
    .select('sheets_per_hour, quality_score, overall_rating')
    .eq('worker_id', workerId)
    .single();
  
  return data;
};
```

---

## Phase 4: Attendance Tracking Migration (90 Days)

**Objective:** Move attendance from workers.attendance_score to leave tracking system.

### Create dedicated attendance table:

```sql
CREATE TABLE attendance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'present', 'absent', 'late', 'half_day'
  minutes_late INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX idx_attendance_employee_date 
  ON attendance_log(employee_id, attendance_date DESC);
```

### Calculate attendance score from leave data:

```sql
-- View: attendance_summary
CREATE OR REPLACE VIEW attendance_summary AS
SELECT 
  e.id AS employee_id,
  e.worker_legacy_id AS worker_id,
  CURRENT_DATE - e.hire_date AS days_employed,
  (SELECT COUNT(*) FROM attendance_log 
   WHERE employee_id = e.id AND status = 'present') AS days_present,
  (SELECT COUNT(*) FROM attendance_log 
   WHERE employee_id = e.id AND status = 'absent') AS days_absent,
  (SELECT COUNT(*) FROM attendance_log 
   WHERE employee_id = e.id AND status = 'late') AS times_late,
  (SELECT COALESCE(SUM(minutes_late), 0) FROM attendance_log 
   WHERE employee_id = e.id) AS total_lateness_minutes,
  -- Calculate score (95% for attendance, 5% deduction per absence)
  GREATEST(0, 95 - (COUNT(DISTINCT al.attendance_date) * 5)) AS attendance_score
FROM employees e
LEFT JOIN attendance_log al ON e.id = al.employee_id
GROUP BY e.id, e.worker_legacy_id;
```

### Update code:

**Before:**
```typescript
const getAttendanceScore = async (workerId) => {
  const { data } = await supabase
    .from('workers')
    .select('attendance_score, lateness_minutes')
    .eq('id', workerId)
    .single();
  
  return data.attendance_score;
};
```

**After:**
```typescript
const getAttendanceScore = async (employeeId) => {
  const { data } = await supabase
    .from('attendance_summary')
    .select('attendance_score, total_lateness_minutes')
    .eq('employee_id', employeeId)
    .single();
  
  return data.attendance_score;
};
```

---

## Phase 5: Domain Separation (180 Days)

**Objective:** Complete removal of workers table (if all code migrated).

**Before removal:**
1. Verify no code queries workers table directly
   ```bash
   grep -r "from('workers')" src/
   grep -r "FROM workers" src/
   grep -r "SELECT.*workers" src/
   ```

2. Migrate any legacy stored procedures/reports:
   ```sql
   -- Rewrite any procedures using workers table
   ```

3. Archive workers data (if needed):
   ```sql
   -- Create historical snapshot
   INSERT INTO workers_archive SELECT * FROM workers;
   ```

4. Remove table:
   ```sql
   DROP TABLE IF EXISTS workers CASCADE;
   ```

---

## Non-Breaking Features

### Automatic Sync from Legacy Code

If code still writes to `workers` table, changes automatically sync to HR domain:

```sql
-- Trigger: sync_workers_to_employees
-- When legacy code does:
UPDATE workers SET name = 'New Name' WHERE id = 'worker-123';

-- This automatically updates:
UPDATE employees SET full_name = 'New Name' 
WHERE worker_legacy_id = 'worker-123';
```

### Backward-Compatible Function Calls

Query deprecation warnings:

```typescript
const getDeprecationWarning = async (fieldName) => {
  const { data } = await supabase.rpc('deprecation_warning', {
    p_field_name: fieldName
  });
  
  return data;
  // Example: "DEPRECATED: Field "sheets_per_hour" will be removed on 2026-12-31. 
  //          Migrate to: task_logs or analytics table. Details: Worker productivity metric..."
};
```

### Migration Status Dashboard

```typescript
const getMigrationStatus = async () => {
  const { data } = await supabase
    .from('migration_status')
    .select('*')
    .order('removal_target_date', { ascending: true });
  
  return data;
  // Shows urgency of each deprecation
};
```

---

## Handling Backward Compatibility Bugs

### Issue: Updated workers record not syncing to employees

**Cause:** Trigger may fail silently due to constraint violation

**Fix:**
```sql
-- Check trigger status
SELECT * FROM pg_trigger WHERE tgrelname = 'workers' AND tgname LIKE '%sync%';

-- Manually sync specific record
UPDATE employees SET full_name = (SELECT name FROM workers WHERE id = 'worker-123')
WHERE worker_legacy_id = 'worker-123';
```

### Issue: View returns NULL for compensation fields

**Cause:** Worker not yet migrated to HR domain

**Fix:**
```typescript
// Check if employee exists
const employee = await supabase
  .from('employees')
  .select('*')
  .eq('worker_legacy_id', workerId)
  .single();

if (!employee.data) {
  // Need to run backfill migration first
  throw new Error('Worker not yet migrated to HR domain');
}
```

---

## Testing the Deprecation

### Test 1: View compatibility

```typescript
test('workers_legacy_view returns data in legacy format', async () => {
  const legacy = await supabase
    .from('workers_legacy_view')
    .select('id, name, department, overall_rating')
    .single();
  
  expect(legacy.data).toHaveProperty('name');
  expect(legacy.data).toHaveProperty('overall_rating');
  expect(legacy.data).toHaveProperty('employee_id'); // New data also available
});
```

### Test 2: Automatic sync

```typescript
test('updating workers table syncs to employees', async () => {
  const originalEmployee = await getEmployee(workerId);
  
  // Update via legacy table
  await supabase
    .from('workers')
    .update({ name: 'Updated Name' })
    .eq('id', workerId);
  
  // Check HR domain updated
  const updated = await getEmployee(workerId);
  expect(updated.full_name).toBe('Updated Name');
});
```

### Test 3: ID conversion

```typescript
test('conversion functions work both ways', async () => {
  const employeeId = 'emp-123';
  
  // Convert to worker ID
  const workerId = await supabase.rpc('get_worker_id_by_employee_id', 
    { p_employee_id: employeeId });
  
  // Convert back
  const backToEmployee = await supabase.rpc('get_employee_id_by_worker_id',
    { p_worker_id: workerId });
  
  expect(backToEmployee).toBe(employeeId);
});
```

---

## Timeline Summary

| Phase | Duration | What Happens | Status |
|-------|----------|--------------|--------|
| Phase 1 | Now | Compatibility views active, SELECT queries can use views | NOW |
| Phase 2 | 30 days | UPDATE/INSERT code migrates to employees table | In Progress |
| Phase 3 | 60 days | Performance metrics move to analytics table | Planned |
| Phase 4 | 90 days | Attendance moves to dedicated table | Planned |
| Phase 5 | 180 days | workers table removed (if no legacy code) | Planned |

---

## Checklist for Migration

### Before Starting
- [ ] Read this entire guide
- [ ] Understand view structure and available fields
- [ ] Back up database
- [ ] Set up staging environment

### Phase 1 (Week 1-4)
- [ ] Replace SELECT * FROM workers with workers_legacy_view
- [ ] Test all SELECT queries still return expected results
- [ ] Update any JOINs on workers table
- [ ] Create monitoring dashboard for view performance

### Phase 2 (Week 4-8)
- [ ] Identify all code writing to workers table
- [ ] Update INSERT to use employees table
- [ ] Update UPDATE to use employees table with conversion helper
- [ ] Test automatic sync trigger works

### Phase 3 (Week 9-16)
- [ ] Create performance_analytics table
- [ ] Migrate performance metrics from workers
- [ ] Create performance_summary view
- [ ] Update code to read from analytics instead

### Phase 4 (Week 17-24)
- [ ] Create attendance_log table
- [ ] Populate from absence data and task logs
- [ ] Create attendance_summary view
- [ ] Update code to read from attendance tracking

### Phase 5 (Week 25-26)
- [ ] Verify no code references workers table
- [ ] Archive workers table if needed
- [ ] Remove workers table
- [ ] Celebrate migration complete! 🎉

---

## Support & Questions

For issues during migration:
- Check the compatibility views are queryable: `SELECT * FROM workers_legacy_view LIMIT 1;`
- Verify triggers are active: `SELECT * FROM pg_trigger WHERE tgrelname = 'workers';`
- Test ID conversion: `SELECT * FROM employees WHERE worker_legacy_id IS NOT NULL;`
- Review deprecation_warning() for specific field guidance

Reference docs:
- [EFFECTIVE_DATE_PATTERNS.md](EFFECTIVE_DATE_PATTERNS.md) - Query new HR domain
- [HR_BACKFILL_GUIDE.md](HR_BACKFILL_GUIDE.md) - Initial migration details
- Migration files: `supabase/migrations/202602211431*.sql`

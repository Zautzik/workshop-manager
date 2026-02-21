# Effective-Date Pattern Reference

Quick reference for working with effective-dated contracts and compensation rates.

## Core Concepts

**Effective Dating**: Historical records for contracts and pay rates that track when values were valid.

**Key Principles**:
- Each record has a `start_date/effective_from` and optional `end_date/effective_to`
- NULL end date means "current/ongoing"
- No overlapping periods allowed (enforced by exclusion constraints)
- Gaps are allowed but should be validated
- Historical queries always use the date to look up which record was active

---

## Common Patterns

### 1. Query Current Values

```sql
-- Get employee's current contract
SELECT * FROM public.get_contract_at_date(
  'employee-uuid',
  CURRENT_DATE
);

-- Get employee's current compensation rate
SELECT * FROM public.get_compensation_at_date(
  'employee-uuid',
  CURRENT_DATE
);
```

### 2. Query Historical Values

```sql
-- What was the contract on June 15, 2025?
SELECT * FROM public.get_contract_at_date(
  'employee-uuid',
  '2025-06-15'::date
);

-- What was the hourly rate on January 1, 2024?
SELECT * FROM public.get_compensation_at_date(
  'employee-uuid',
  '2024-01-01'::date
);
```

### 3. Create Initial Record

```sql
-- First contract for new employee
INSERT INTO public.employment_contracts (
  employee_id,
  contract_type,
  start_date,
  end_date,  -- NULL = ongoing
  base_hours_per_week,
  max_hours_per_day,
  max_hours_per_week,
  overtime_allowed
) VALUES (
  'employee-uuid',
  'full_time',
  '2026-03-01',
  NULL,
  40,
  8,
  48,
  true
);

-- First compensation rate
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,  -- NULL = current
  hourly_rate,
  overtime_multiplier_50,
  currency_code
) VALUES (
  'employee-uuid',
  '2026-03-01',
  NULL,
  16.00,
  1.50,
  'USD'
);
```

### 4. Update to New Value (Close Old, Open New)

```sql
-- Raise effective March 1, 2026
BEGIN;

-- Step 1: Close current rate at Feb 29
UPDATE public.compensation_rates
SET effective_to = '2026-02-29'
WHERE employee_id = 'employee-uuid'
  AND effective_to IS NULL;  -- Find the "current" rate

-- Step 2: Create new rate starting Mar 1
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,
  hourly_rate,
  overtime_multiplier_50,
  currency_code
) VALUES (
  'employee-uuid',
  '2026-03-01',
  NULL,  -- New current rate
  18.50,
  1.50,
  'USD'
);

COMMIT;
```

### 5. Plan Future Change

```sql
-- Schedule raise for 6 months from now
-- Current rate continues until that date
BEGIN;

UPDATE public.compensation_rates
SET effective_to = '2026-08-31'
WHERE employee_id = 'employee-uuid'
  AND effective_to IS NULL;

INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  hourly_rate,
  overtime_multiplier_50
) VALUES (
  'employee-uuid',
  '2026-09-01',  -- Future date
  20.00,
  1.50
);

COMMIT;
```

### 6. Retroactive Correction

```sql
-- Discovered employee should have gotten raise on June 1, not July 1
-- Current state: Rate $15 from Jan 1 - May 31, Rate $18 from July 1 - NULL
-- Need: Insert $18 rate from June 1 - June 30

BEGIN;

-- Adjust the later rate to start July 1
UPDATE public.compensation_rates
SET effective_from = '2025-07-01'
WHERE employee_id = 'employee-uuid'
  AND effective_from = '2025-07-01';  -- Assuming this is the wrong one

-- Insert missing June rate
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  effective_to,
  hourly_rate,
  overtime_multiplier_50
) VALUES (
  'employee-uuid',
  '2025-06-01',
  '2025-06-30',
  18.00,
  1.50
);

COMMIT;

-- Recalculate June payroll
SELECT * FROM public.calculate_payroll_for_period(
  'employee-uuid',
  '2025-06-01'::date,
  '2025-06-30'::date
);
```

### 7. Terminate Employment

```sql
-- Employee's last day is Feb 28, 2026
UPDATE public.employment_contracts
SET end_date = '2026-02-28'
WHERE employee_id = 'employee-uuid'
  AND end_date IS NULL;

-- Also close compensation rate
UPDATE public.compensation_rates
SET effective_to = '2026-02-28'
WHERE employee_id = 'employee-uuid'
  AND effective_to IS NULL;

-- Update employee status
UPDATE public.employees
SET 
  status = 'terminated',
  termination_date = '2026-02-28'
WHERE id = 'employee-uuid';
```

### 8. Rehire Former Employee

```sql
-- Create new contract starting on rehire date
INSERT INTO public.employment_contracts (
  employee_id,
  contract_type,
  start_date,
  base_hours_per_week,
  max_hours_per_day,
  overtime_allowed
) VALUES (
  'employee-uuid',
  'full_time',
  '2026-04-01',  -- Rehire date
  40,
  8,
  true
);

-- Create new compensation rate (may be different from previous)
INSERT INTO public.compensation_rates (
  employee_id,
  effective_from,
  hourly_rate,
  overtime_multiplier_50
) VALUES (
  'employee-uuid',
  '2026-04-01',
  17.50,  -- Negotiated rehire rate
  1.50
);

-- Reactivate employee
UPDATE public.employees
SET status = 'active'
WHERE id = 'employee-uuid';
```

---

## Payroll Calculations

### Calculate Single Day

```sql
SELECT * FROM public.calculate_payroll_for_assignment(
  p_employee_id := 'employee-uuid',
  p_assignment_date := '2025-08-15',
  p_regular_hours := 8,
  p_overtime_50_hours := 4,  -- 4 hours at time-and-a-half
  p_overtime_100_hours := 0, -- 0 hours at double-time
  p_night_hours := 0,
  p_weekend_hours := 0
);

-- Returns:
-- base_pay | overtime_50_pay | overtime_100_pay | night_differential | weekend_differential | total_pay | hourly_rate | currency
-- 120.00   | 90.00           | 0.00             | 0.00               | 0.00                 | 210.00    | 15.00       | USD
```

### Calculate Full Period (Aggregate)

```sql
SELECT * FROM public.calculate_payroll_for_period(
  'employee-uuid',
  '2025-08-01'::date,
  '2025-08-31'::date
);

-- Returns:
-- total_regular_hours | total_overtime_hours | total_pay | assignments_count | breakdown (JSONB with daily details)
-- 168                 | 16                   | 2880.00   | 23                | [{"date": "2025-08-01", "hours": 8, ...}, ...]
```

---

## Audit Queries

### View All Rate Changes

```sql
SELECT 
  effective_from,
  effective_to,
  hourly_rate,
  rate_change_amount,
  rate_change_percent,
  days_active
FROM public.get_compensation_history('employee-uuid')
ORDER BY effective_from DESC;
```

### View All Contract Changes

```sql
SELECT 
  start_date,
  end_date,
  contract_type,
  base_hours_per_week,
  overtime_allowed,
  is_current
FROM public.get_contract_history('employee-uuid')
ORDER BY start_date DESC;
```

### Check Coverage Gaps

```sql
-- Validate contracts cover entire 2025
SELECT * FROM public.validate_contract_coverage(
  'employee-uuid',
  '2025-01-01'::date,
  '2025-12-31'::date
);

-- If has_complete_coverage = false, check coverage_gaps JSONB:
-- [{"start_date": "2025-07-01", "end_date": "2025-07-31", "days": 31}]
```

---

## React Query Integration (TypeScript)

### Query Hooks

```typescript
// src/hooks/use-queries.ts

export const useCurrentCompensation = (employeeId: string) => {
  return useQuery({
    queryKey: ['compensation', 'current', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_compensation_at_date', {
          p_employee_id: employeeId,
          p_date: new Date().toISOString().split('T')[0]
        });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId
  });
};

export const useCurrentContract = (employeeId: string) => {
  return useQuery({
    queryKey: ['contract', 'current', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_contract_at_date', {
          p_employee_id: employeeId,
          p_date: new Date().toISOString().split('T')[0]
        });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId
  });
};

export const useCompensationHistory = (employeeId: string) => {
  return useQuery({
    queryKey: ['compensation', 'history', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_compensation_history', {
          p_employee_id: employeeId
        });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId
  });
};

export const usePayrollForPeriod = (
  employeeId: string,
  startDate: string,
  endDate: string
) => {
  return useQuery({
    queryKey: ['payroll', employeeId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('calculate_payroll_for_period', {
          p_employee_id: employeeId,
          p_start_date: startDate,
          p_end_date: endDate
        });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId && !!startDate && !!endDate
  });
};
```

### Usage in Components

```typescript
// Component showing employee's current rate
const EmployeeCompensation: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const { data: compensation, isLoading } = useCurrentCompensation(employeeId);
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <p>Hourly Rate: ${compensation.hourly_rate}</p>
      <p>OT Premium (50%): {compensation.overtime_multiplier_50}x</p>
      <p>OT Premium (100%): {compensation.overtime_multiplier_100}x</p>
      <p>Effective Since: {compensation.effective_from}</p>
    </div>
  );
};

// Component showing payroll summary
const PayrollSummary: React.FC<{ employeeId: string; month: string }> = ({ employeeId, month }) => {
  const startDate = `${month}-01`;
  const endDate = new Date(month + '-01').toISOString().slice(0, 7) + '-31';
  
  const { data: payroll } = usePayrollForPeriod(employeeId, startDate, endDate);
  
  return (
    <div>
      <h3>Payroll for {month}</h3>
      <p>Regular Hours: {payroll?.total_regular_hours}</p>
      <p>Overtime Hours: {payroll?.total_overtime_hours}</p>
      <p>Total Pay: ${payroll?.total_pay?.toFixed(2)}</p>
      <p>Assignments: {payroll?.assignments_count}</p>
    </div>
  );
};
```

---

## Best Practices

### ✅ DO:
- Always use transactions when closing one period and opening another
- Query historical data using `get_X_at_date(id, date)` functions
- Validate coverage before running payroll: `validate_contract_coverage()`
- Use `effective_to = NULL` to indicate current/ongoing rates
- Close old periods the day before new periods begin (no gaps)

### ❌ DON'T:
- Don't leave multiple records with NULL end dates (will violate overlap constraint)
- Don't delete historical records (breaks audit trail)
- Don't query tables directly for "current" values (use helper functions instead)
- Don't assume rates exist for all dates (check for NULL in payroll calculations)
- Don't change effective dates on existing records without checking for overlaps

---

## Migration Checklist

When adding effective-date support to a new table:

1. **Add date columns**: `effective_from DATE NOT NULL`, `effective_to DATE`
2. **Add CHECK constraint**: `CHECK (effective_to IS NULL OR effective_to >= effective_from)`
3. **Add exclusion constraint**: 
   ```sql
   EXCLUDE USING gist (
     entity_id WITH =,
     daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
   )
   ```
4. **Create helper function**: `get_X_at_date(entity_id, date)`
5. **Create indexes**: `CREATE INDEX idx_X_effective ON table(entity_id, effective_from DESC)`
6. **Document**: Add examples to this reference guide

---

## Quick Troubleshooting

**Error: "conflicting key value violates exclusion constraint"**  
→ You're trying to insert a record that overlaps with an existing one. Close the old record first.

**Query returns NULL**  
→ No record exists for that date. Check the effective date boundaries.

**Payroll calculation throws "No compensation rate found"**  
→ Employee has no rate defined for that date. Insert a rate with proper effective_from date.

**Rate change didn't take effect**  
→ Check you closed the old rate with `effective_to` before the new `effective_from` date.

**Historical report shows wrong values**  
→ Verify you're using `get_X_at_date()` functions, not direct table queries with simple WHERE clauses.

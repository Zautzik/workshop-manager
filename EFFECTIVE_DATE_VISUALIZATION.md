# Effective-Date Visualization

Understanding how effective-dated records work in the HR domain.

## Timeline Representation

### Example: Employee Compensation History

```
Employee: John Doe (hired 2024-01-01)

Timeline:
2024-01-01         2024-07-01         2025-01-01         2025-06-01         Now (2026-02-21)
    |                  |                  |                  |                  |
    |--- $15.00/hr ----|--- $16.50/hr ----|--- $18.00/hr ----|--- $20.00/hr ----|------------->
    |                  |                  |                  |                  |
    Rate A             Rate B             Rate C             Rate D             (ongoing)
```

### Database Records:

| ID | employee_id | effective_from | effective_to | hourly_rate |
|----|-------------|----------------|--------------|-------------|
| 1  | john-uuid   | 2024-01-01     | 2024-06-30   | $15.00      |
| 2  | john-uuid   | 2024-07-01     | 2024-12-31   | $16.50      |
| 3  | john-uuid   | 2025-01-01     | 2025-05-31   | $18.00      |
| 4  | john-uuid   | 2025-06-01     | NULL         | $20.00      |

**Key Points:**
- Each record has a defined start date (`effective_from`)
- End date (`effective_to`) is the **last day** the rate was valid
- NULL end date means "current/ongoing"
- No gaps between periods (2024-06-30 → 2024-07-01)
- No overlaps (enforced by database constraint)

---

## Querying at Different Dates

### Query: What was John's rate on February 15, 2025?

```sql
SELECT * FROM get_compensation_at_date('john-uuid', '2025-02-15');
```

**Logic:**
```
Looking for record where:
  - effective_from <= '2025-02-15'  ✓
  - effective_to >= '2025-02-15' OR effective_to IS NULL  ✓

2025-01-01 <= 2025-02-15? YES
2025-05-31 >= 2025-02-15? YES

Result: Rate C = $18.00/hr
```

### Query: What is John's current rate?

```sql
SELECT * FROM get_compensation_at_date('john-uuid', CURRENT_DATE);
-- CURRENT_DATE = 2026-02-21
```

**Logic:**
```
Looking for record where:
  - effective_from <= '2026-02-21'  ✓
  - effective_to >= '2026-02-21' OR effective_to IS NULL  ✓

2025-06-01 <= 2026-02-21? YES
NULL >= 2026-02-21 OR NULL IS NULL? YES (NULL = ongoing)

Result: Rate D = $20.00/hr
```

---

## Updating Rates (Timeline Changes)

### Scenario 1: Give Raise Starting March 1, 2026

**Current State:**
```
2025-06-01                                Now (2026-02-21)      2026-03-01
    |-------------------------------------|---------------------|------------------->
    |         Rate D: $20.00/hr          | (still $20.00)      | (want $22.00)
```

**Goal State:**
```
2025-06-01                                2026-02-28           2026-03-01
    |-------------------------------------|---------------------|------------------->
    |         Rate D: $20.00/hr          |                     | Rate E: $22.00/hr
```

**SQL:**
```sql
-- Step 1: Close Rate D at Feb 28
UPDATE compensation_rates 
SET effective_to = '2026-02-28'
WHERE employee_id = 'john-uuid' AND effective_to IS NULL;

-- Step 2: Create Rate E starting Mar 1
INSERT INTO compensation_rates (employee_id, effective_from, hourly_rate)
VALUES ('john-uuid', '2026-03-01', 22.00);
```

**Result in DB:**
| ID | employee_id | effective_from | effective_to | hourly_rate |
|----|-------------|----------------|--------------|-------------|
| 4  | john-uuid   | 2025-06-01     | 2026-02-28   | $20.00      |
| 5  | john-uuid   | 2026-03-01     | NULL         | $22.00      |

---

### Scenario 2: Fix Historical Error (Retroactive)

**Current State:**
```
2024-07-01         2025-01-01         2025-06-01         Now
    |------------------|------------------|------------------|
    |   $16.50/hr     |   $18.00/hr     |   $20.00/hr     |
```

**Problem:** Employee should have gotten raise on 2025-03-01, not 2025-06-01

**Goal State:**
```
2024-07-01         2025-01-01    2025-03-01    2025-06-01         Now
    |------------------|-------------|-------------|------------------|
    |   $16.50/hr     | $18.00/hr  | $20.00/hr  | $20.00/hr       |
```

**SQL:**
```sql
BEGIN;

-- Close Rate C on Feb 28, 2025 (instead of May 31)
UPDATE compensation_rates
SET effective_to = '2025-02-28'
WHERE id = 3;

-- Create new rate for March-May period
INSERT INTO compensation_rates (employee_id, effective_from, effective_to, hourly_rate)
VALUES ('john-uuid', '2025-03-01', '2025-05-31', 20.00);

-- Rate D already starts June 1, so no change needed

COMMIT;
```

**Result:** March-May payroll can now be recalculated with correct $20/hr rate.

---

## Common Pitfalls (Visual)

### ❌ Mistake 1: Overlapping Periods

```
Rate A: 2024-01-01 → NULL
Rate B: 2024-07-01 → NULL

Timeline:
2024-01-01              2024-07-01              Now
    |----------------------|----------------------|
    |      Rate A         |    BOTH RATES       |
    |                     |    ACTIVE HERE!     |
    |                     |    ❌ CONFLICT      |
```

**Database Constraint Violation:**
```
ERROR: conflicting key value violates exclusion constraint
```

**Fix:** Close Rate A before Rate B starts:
```sql
UPDATE ... SET effective_to = '2024-06-30' WHERE id = A;
```

---

### ❌ Mistake 2: Gaps in Coverage

```
Rate A: 2024-01-01 → 2024-12-31
Rate B: 2025-03-01 → NULL

Timeline:
2024-01-01    2024-12-31   2025-01-01   2025-02-28   2025-03-01   Now
    |-------------|-------------|-----------|-------------|---------|
    |   Rate A   |  GAP (no rate defined) |   Rate B   |
                 |  ❌ 59 days without rate|
```

**Payroll Calculation Error:**
```
ERROR: No compensation rate found for employee at date 2025-02-15
```

**Fix:** Either close Rate A on 2025-02-28, or start Rate B on 2025-01-01:
```sql
UPDATE ... SET effective_to = '2025-02-28' WHERE id = A;
```

---

### ✅ Correct: Continuous No-Overlap Coverage

```
Rate A: 2024-01-01 → 2024-12-31
Rate B: 2025-01-01 → 2025-06-30
Rate C: 2025-07-01 → NULL

Timeline:
2024-01-01    2024-12-31 2025-01-01    2025-06-30 2025-07-01    Now
    |-------------|---------|-------------|---------|-------------|
    |   Rate A   |         |   Rate B   |         |   Rate C   |
                 └─────────┘            └─────────┘
                 No gap                 No gap
                 No overlap             No overlap
```

**Characteristics:**
- Each `effective_to` is the day before next `effective_from`
- Last record has NULL `effective_to` (ongoing)
- Every date from hire to now has exactly one rate

---

## Payroll Calculation Flow

### Single Assignment Calculation

```
Date: 2025-08-15
Employee: John Doe
Hours: 8 regular + 4 overtime

Step 1: Find rate at 2025-08-15
┌──────────────────────────────────┐
│ get_compensation_at_date()      │
│ Returns: $20.00/hr (Rate D)     │
└──────────────────────────────────┘

Step 2: Calculate pay components
┌──────────────────────────────────┐
│ Base pay:    8 hrs × $20 = $160 │
│ OT pay (50%): 4 hrs × $20 × 1.5 │
│              = 4 × $30 = $120    │
│ Total: $280                      │
└──────────────────────────────────┘
```

### Period Calculation (Multiple Days)

```
Period: 2025-08-01 to 2025-08-31
Employee: John Doe

Day-by-day calculation:
┌────────────┬───────────┬─────────┬──────────┐
│ Date       │ Rate      │ Hours   │ Pay      │
├────────────┼───────────┼─────────┼──────────┤
│ 2025-08-01 │ $20.00/hr │ 8 reg   │ $160.00  │
│ 2025-08-02 │ $20.00/hr │ 8 reg   │ $160.00  │
│ 2025-08-03 │ $20.00/hr │ 8+4 OT  │ $280.00  │
│ ...        │ ...       │ ...     │ ...      │
│ 2025-08-31 │ $20.00/hr │ 8 reg   │ $160.00  │
└────────────┴───────────┴─────────┴──────────┘

Aggregated Totals:
- Total regular hours: 168
- Total OT hours: 16
- Total pay: $2,880
- Assignments: 23 days
```

**Key:** Each day uses the historically correct rate for that specific date.

---

## Contract Changes (Similar Pattern)

### Contract Timeline

```
Employee: Jane Smith

2024-01-01         2024-07-01         2025-01-01      Now
    |------------------|------------------|--------------|
    | Part-time:      | Full-time:      | Full-time:  |
    | 20 hrs/week     | 40 hrs/week     | 40 hrs/week |
    | No OT allowed   | OT allowed      | OT allowed  |
```

### Querying Contract Terms

```sql
-- What were Jane's contract terms on 2024-09-15?
SELECT * FROM get_contract_at_date('jane-uuid', '2024-09-15');

Result:
- contract_type: full_time
- base_hours_per_week: 40
- overtime_allowed: true
- start_date: 2024-07-01
- end_date: 2024-12-31
```

---

## Multi-Rate Period (Advanced)

### Scenario: Rate Change Mid-Month

```
January 2025:
┌───────────────────────────────────────────────────────┐
│  Jan 1-15: $18/hr    │  Jan 16-31: $20/hr            │
│  (15 days)           │  (16 days)                    │
└───────────────────────────────────────────────────────┘
```

**Payroll Calculation:**
```sql
-- System calculates each assignment with its date-specific rate
Jan 1:  8 hrs × $18 = $144
Jan 2:  8 hrs × $18 = $144
...
Jan 15: 8 hrs × $18 = $144  (last day at old rate)
Jan 16: 8 hrs × $20 = $160  (first day at new rate)
Jan 17: 8 hrs × $20 = $160
...
Jan 31: 8 hrs × $20 = $160

Total: (15 days × $144) + (16 days × $160) = $2,160 + $2,560 = $4,720
```

---

## Audit Trail Visualization

### Compensation History Report

```
Employee: John Doe
Compensation History (Most recent first)

┌──────────────────────────────────────────────────────────────────┐
│ Current Rate (since 2025-06-01)                                 │
│ $20.00/hr │ OT: 1.5x │ Active: 265 days │ Change: +$2 (+11.1%) │
└──────────────────────────────────────────────────────────────────┘
                               ↑
┌──────────────────────────────────────────────────────────────────┐
│ Previous Rate (2025-01-01 to 2025-05-31)                        │
│ $18.00/hr │ OT: 1.5x │ Active: 151 days │ Change: +$1.50 (+9%) │
└──────────────────────────────────────────────────────────────────┘
                               ↑
┌──────────────────────────────────────────────────────────────────┐
│ Previous Rate (2024-07-01 to 2024-12-31)                        │
│ $16.50/hr │ OT: 1.5x │ Active: 184 days │ Change: +$1.50 (+10%)│
└──────────────────────────────────────────────────────────────────┘
                               ↑
┌──────────────────────────────────────────────────────────────────┐
│ Initial Rate (2024-01-01 to 2024-06-30)                         │
│ $15.00/hr │ OT: 1.5x │ Active: 182 days │ Starting rate        │
└──────────────────────────────────────────────────────────────────┘

Total raises: 3
Total increase: $5.00 (+33.3%)
Average annual raise: ~11%
```

---

## Summary: Key Concepts

1. **Point-in-Time Queries**: Always query "what was true on date X"
2. **No Overlaps**: Database prevents two records active on same date
3. **Gaps Possible**: System allows gaps but warns via validation functions
4. **NULL = Current**: NULL end_date means "ongoing/active now"
5. **Immutable History**: Never delete historical records
6. **Atomic Updates**: Use transactions when closing/opening periods
7. **Date-Specific Calculations**: Each day uses its historically correct rate

---

## Further Reading

- [EFFECTIVE_DATE_PATTERNS.md](EFFECTIVE_DATE_PATTERNS.md) - SQL query patterns
- [HR_MIGRATION_GUIDE.md](HR_MIGRATION_GUIDE.md) - Migration procedures
- [supabase/migrations/20260221143300_effective_date_enhancements.sql](supabase/migrations/20260221143300_effective_date_enhancements.sql) - Database functions

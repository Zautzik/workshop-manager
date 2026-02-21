# HR Domain Migration Audit

Date: 2026-02-21
Scope: Worker, shift, overtime, and planning data migration into HR-first domain.

## 1) Current State Audit

### 1.1 Core workforce data model (current)

#### `workers`
Current columns (from generated DB types):
- `id` (UUID, PK)
- `name` (TEXT)
- `department` (TEXT)
- Performance/behavior metrics mixed into profile:
  - `sheets_per_hour`, `teamwork_rating`, `quality_score`, `speed_score`, `overall_rating`
  - `attendance_score`, `lateness_minutes`
  - `overtime_availability` (BOOLEAN)
- `created_at`, `updated_at`

Observed issue:
- `workers` currently mixes identity + HR eligibility + performance analytics in one table.

#### `shifts`
- `id`, `name`, `start_time`, `end_time`, `created_at`

#### `worker_assignments`
- `id`, `worker_id`, `workstation_id`, `shift_id`, `date`, `role`, `ot_id`, `created_at`, `updated_at`
- Overtime is encoded in `role` text patterns (example: `overtime_operator_50`), not normalized.

#### Legacy workforce group model
- `rosters`, `roster_workers` exist and are partially reused by workflow (`worker_assignments.ot_id` references `rosters.id`).
- Semantics are mixed (roster vs OT linkage).

#### Supporting productivity model
- `task_logs` and `worker_stats` view provide operational/performance aggregates.

### 1.2 Overtime implementation (current)

Current logic is application-derived, not policy-backed:
- Worker can be in both shifts when already assigned in other shift and `workers.overtime_availability = true`.
- Overtime premium (50%) is implied by assignment role string (`overtime_*_50`).
- Monthly overtime is computed from assignments where `role ILIKE '%overtime%'` and shift duration.

Observed issue:
- No normalized overtime policy table, no effective dating, no legal limits table, no payroll-grade audit for overtime decisions.

### 1.3 API and UI dependency map (must be migrated)

Primary code dependencies on `workers` / `worker_assignments` / `shifts`:
- [src/hooks/use-queries.ts](src/hooks/use-queries.ts)
- [src/page-components/WorkflowDashboard.tsx](src/page-components/WorkflowDashboard.tsx)
- [src/components/workflow/WorkstationLayout.tsx](src/components/workflow/WorkstationLayout.tsx)
- [src/components/workflow/WorkerStatsPanel.tsx](src/components/workflow/WorkerStatsPanel.tsx)
- [src/components/admin/WorkersManagement.tsx](src/components/admin/WorkersManagement.tsx)
- [src/components/admin/ExecutiveOverview.tsx](src/components/admin/ExecutiveOverview.tsx)
- [src/components/supervisor/WorkerRoster.tsx](src/components/supervisor/WorkerRoster.tsx)
- [src/components/manager/WorkerStatsReport.tsx](src/components/manager/WorkerStatsReport.tsx)
- [src/app/api/workers/route.ts](src/app/api/workers/route.ts)
- [src/app/api/workers/[id]/route.ts](src/app/api/workers/[id]/route.ts)
- [src/app/api/worker-stats/route.ts](src/app/api/worker-stats/route.ts)

Finance links impacted by HR migration:
- [src/components/financial/OTFinancialTracking.tsx](src/components/financial/OTFinancialTracking.tsx)
- [src/components/supervisor/AddJobToOTDialog.tsx](src/components/supervisor/AddJobToOTDialog.tsx)

### 1.4 Schema drift found

Potential drift between migration history, generated types, and app usage:
- `user_roles` is used with `department` and `manager_domain` in API code, but those columns are not present in the visible migration set and not present in current generated types.
- `worker_assignments.ot_id` points to `rosters.id` in generated types, but workflow treats selected OT context as work-order-like assignment context.

This must be reconciled before or during HR migration.

---

## 2) Target HR Domain (recommended)

### 2.1 New source-of-truth entities

1. `employees`
- Identity and lifecycle only (employment-level person record)
- Suggested: `id`, `worker_legacy_id`, `user_id?`, `employee_code`, `full_name`, `status`, `department_code`, `hire_date`, `termination_date`, `created_at`, `updated_at`

2. `employment_contracts`
- Legal/contractual terms (effective-dated)
- Suggested: `id`, `employee_id`, `contract_type`, `weekly_hours_limit`, `daily_hours_limit`, `overtime_allowed`, `overtime_cap_hours_week`, `rest_hours_min`, `effective_from`, `effective_to`

3. `compensation_rates`
- Base and premium rates (effective-dated)
- Suggested: `id`, `employee_id`, `hourly_rate`, `currency`, `overtime_multiplier_50`, `overtime_multiplier_100`, `shift_differential_evening`, `shift_differential_night`, `effective_from`, `effective_to`

4. `employee_skills`
- Normalized skill tracking
- Suggested: `id`, `employee_id`, `skill_code`, `level`, `certified`, `valid_until`, `updated_at`

5. `station_skill_requirements`
- Required skills per workstation type/station
- Suggested: `id`, `workstation_id or workstation_type`, `skill_code`, `required_level`

6. `employee_availability`
- Weekly recurring availability + ad-hoc exceptions
- Suggested: `id`, `employee_id`, `day_of_week`, `start_time`, `end_time`, `available`

7. `leave_balances`
- Running balances by leave type
- Suggested: `id`, `employee_id`, `leave_type`, `accrued_hours`, `used_hours`, `balance_hours`, `as_of`

8. `leave_requests`
- Approval workflow
- Suggested: `id`, `employee_id`, `leave_type`, `start_date`, `end_date`, `hours_requested`, `status`, `approved_by`, `approved_at`, `notes`

9. `incentive_rules` and `employee_incentives`
- Policy and awarded incentive records

10. `overtime_policies`
- Organization policies (thresholds, multipliers, legal checks)

### 2.2 Keep and adapt existing planning tables

- Keep `shifts` and `workstations`.
- Evolve `worker_assignments` to `employee_assignments` (or keep name short-term and add `employee_id` + compatibility view).

---

## 3) Field-Level Migration Map

## 3.1 `workers` -> HR entities

| Current source | Target table.column | Rule |
|---|---|---|
| `workers.id` | `employees.worker_legacy_id` | Preserve for traceability |
| `workers.name` | `employees.full_name` | Direct copy |
| `workers.department` | `employees.department_code` | Normalize to controlled enum/code list |
| `workers.overtime_availability` | `employment_contracts.overtime_allowed` | Copy latest value into initial active contract |
| `workers.created_at` | `employees.created_at` | Copy |
| `workers.updated_at` | `employees.updated_at` | Copy |
| `workers.sheets_per_hour` | `employee_incentives` or analytics snapshot | Do not keep in core identity; move to performance/analytics domain |
| `workers.teamwork_rating` | performance snapshot table | Same as above |
| `workers.quality_score` | performance snapshot table | Same as above |
| `workers.speed_score` | performance snapshot table | Same as above |
| `workers.overall_rating` | performance snapshot table | Same as above |
| `workers.attendance_score` | attendance analytics table | Same as above |
| `workers.lateness_minutes` | attendance analytics table | Same as above |

## 3.2 `worker_assignments` -> HR planning

| Current source | Target table.column | Rule |
|---|---|---|
| `worker_assignments.worker_id` | `employee_assignments.employee_id` | Map using `employees.worker_legacy_id` |
| `shift_id` | `shift_id` | Keep |
| `workstation_id` | `workstation_id` | Keep |
| `date` | `date` | Keep |
| `role` | `assignment_role` + `overtime_flag` + `overtime_multiplier` | Parse `overtime_*_50` to structured fields |
| `ot_id` | `work_order_id` (if truly OT/work order) or `legacy_roster_id` | Resolve semantic ambiguity first |

## 3.3 New compensation baseline (currently missing)

No current source fields for:
- `hourly_rate`, `currency`, `shift_differentials`, `effective dates`

Migration action:
- Create default org-level compensation policy and backfill employee-specific rates from defaults until real HR data is loaded.

## 3.4 Leave/vacation and incentives (currently missing)

No current source fields for:
- leave balances, leave requests, incentive definitions, incentive payouts.

Migration action:
- Initialize with zero balances and configurable accrual policy, then import HR historical records if available.

---

## 4) Migration Strategy (phased, low-risk)

### Phase 0: Guardrails
1. Add new HR tables without modifying existing reads.
2. Add compatibility views and mapping table:
   - `employee_worker_map(employee_id, worker_id)` if needed.

### Phase 1: Backfill + dual write
1. Backfill `employees` and initial `employment_contracts` from `workers`.
2. Backfill assignment link (`employee_id`) into planning assignments.
3. Update APIs to dual write (`workers` + new HR tables) temporarily.

### Phase 2: Read switch
1. Switch read paths in hooks/APIs from `workers` to HR-backed employee views.
2. Keep fallback compatibility view named `workers_legacy_view` for old components during transition.

### Phase 3: Policy normalization
1. Replace overtime role-string parsing with normalized overtime fields and policy lookups.
2. Integrate leave checks and compensation into assignment validation.

### Phase 4: Decommission
1. Freeze writes to old worker fields.
2. Remove legacy coupling after full cutover and verification.

---

## 5) Required decisions before implementation

1. Canonical identity: Should `employees` link to app `users` 1:1 or be independent with optional user account?
2. Department taxonomy: canonical enum list and localization keys.
3. Overtime semantics: Is 50% always fixed, or policy-driven by day/holiday/contract?
4. `ot_id` meaning in assignments: roster or work order? (Must be normalized.)
5. Payroll currency and effective date behavior for retroactive salary changes.

---

## 6) Immediate implementation-ready next steps

1. Create migration: HR core tables (`employees`, `employment_contracts`, `compensation_rates`, `employee_skills`, `leave_balances`, `leave_requests`, `incentive_rules`, `employee_incentives`, `overtime_policies`).
2. Create backfill migration from `workers` to `employees` + active contract seed.
3. Add `employee_id` to assignment table and populate it.
4. Add HR read views to keep existing UI stable while refactoring APIs.
5. Refactor worker APIs first, then workflow scheduling hooks.

---

## 7) Risk register

- **Schema drift risk**: Migrations and generated types are not fully aligned (`user_roles` fields mismatch).
- **Semantic risk**: `ot_id` reference to `rosters` conflicts with workflow “OT” mental model.
- **Data quality risk**: Department values are free-text and currently used for assignment heuristics.
- **Functional risk**: Overtime currently inferred from role strings; must preserve behavior during cutover.

Mitigation:
- Add one pre-migration verification script and one post-migration parity check for worker count, assignment count, overtime monthly totals, and shift occupancy.

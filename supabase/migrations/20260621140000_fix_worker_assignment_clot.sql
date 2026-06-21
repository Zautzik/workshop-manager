-- ============================================================================
-- Fix the labor→cost "clot": worker_assignments.employee_id is often NULL while
-- worker_id (legacy) is set, so payroll/margin can't map assignments to an
-- employee. Backfill the bridge and keep it healed on every future write.
-- (Root lesion from docs/organism-vital-signs.md.)  Idempotent.
-- ============================================================================

-- 1) Backfill: resolve employee_id from the legacy worker_id ------------------
update public.worker_assignments wa
set employee_id = e.id
from public.employees e
where wa.employee_id is null
  and wa.worker_id is not null
  and e.worker_legacy_id is not null
  and e.worker_legacy_id::text = wa.worker_id::text;

-- 2) Self-healing trigger: set employee_id on insert/update when missing ------
create or replace function public.resolve_assignment_employee()
returns trigger
language plpgsql
as $$
begin
  if new.employee_id is null and new.worker_id is not null then
    select e.id
      into new.employee_id
    from public.employees e
    where e.worker_legacy_id is not null
      and e.worker_legacy_id::text = new.worker_id::text
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_assignment_employee on public.worker_assignments;
create trigger trg_resolve_assignment_employee
  before insert or update on public.worker_assignments
  for each row execute function public.resolve_assignment_employee();

-- 3) Index for the labor joins -----------------------------------------------
create index if not exists worker_assignments_employee_id_idx
  on public.worker_assignments (employee_id);

-- Verification (run manually after applying):
--   select count(*) filter (where employee_id is null and worker_id is not null)
--          as still_unmapped,
--          count(*) as total
--   from public.worker_assignments;

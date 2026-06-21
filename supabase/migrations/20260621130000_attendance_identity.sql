-- ============================================================================
-- Identity & Presence keystone (Industry 6.0): login-less station badge-in.
-- ----------------------------------------------------------------------------
-- One station kiosk badge-in does three jobs: clocks attendance, attributes the
-- operator's captures, and resolves operator -> employee (the labor bridge).
-- Pluggable identity: QR badge now, face-recognition later, manual fallback.
--
-- Idempotent. Apply, then regenerate types.ts; the clock-in route + identity
-- resolver use casts until the new objects are in the generated types.
-- ============================================================================

-- 1) Operator badge on the employee (the QR / credential code) ---------------
alter table public.employees
  add column if not exists badge_code text;

create unique index if not exists employees_badge_code_idx
  on public.employees (badge_code) where badge_code is not null;

comment on column public.employees.badge_code is
  'Operator badge / QR credential — resolves a station badge-in to this employee.';

-- 2) Attendance / clock events (the measured heartbeat) ----------------------
create table if not exists public.attendance_events (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id)   on delete set null,
  station_id  uuid references public.workstations(id) on delete set null,
  event_type  text not null check (event_type in ('clock_in','clock_out')),
  method      text not null default 'qr' check (method in ('qr','face','manual')),
  at          timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists attendance_events_employee_idx on public.attendance_events (employee_id, at desc);
create index if not exists attendance_events_station_idx  on public.attendance_events (station_id, at desc);

comment on table public.attendance_events is
  'Station badge-in/out clock events — attendance heartbeat + capture attribution.';

-- NOTE: enable RLS to match your posture (service-role writes via API; reads for
-- authenticated staff). Operators never authenticate — the station device does.

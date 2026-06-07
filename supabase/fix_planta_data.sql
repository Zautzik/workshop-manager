-- 1. Remove any assignments referencing pre_press workstations, then delete them
DELETE FROM public.worker_assignments
WHERE workstation_id IN (SELECT id FROM public.workstations WHERE type = 'pre_press');

DELETE FROM public.workstations WHERE type = 'pre_press';

-- 2. Rename workshop stations with distinct names
UPDATE public.workstations
SET name = 'Taller Manual — Corte y Doblez'
WHERE type = 'manual_workshop' AND name = 'Taller Manual';

UPDATE public.workstations
SET name = 'Terminaciones A'
WHERE type = 'workshop' AND name = 'Workshop Station 1';

UPDATE public.workstations
SET name = 'Terminaciones B'
WHERE type = 'workshop' AND name = 'Workshop Station 2';

UPDATE public.workstations
SET name = 'Terminaciones C'
WHERE type = 'workshop' AND name = 'Workshop Station 3';

UPDATE public.workstations
SET name = 'Terminaciones D'
WHERE type = 'workshop' AND name = 'Workshop Station 4';

UPDATE public.workstations
SET name = 'Terminaciones E'
WHERE type = 'workshop' AND name = 'Workshop Station 5';

-- 3. Re-seed today's assignments using Turno Mañana
DELETE FROM public.worker_assignments WHERE date = CURRENT_DATE;

INSERT INTO public.worker_assignments (employee_id, workstation_id, shift_id, date, role)
SELECT
  e.id,
  w.id,
  s.id,
  CURRENT_DATE,
  CASE WHEN rn.r <= 10 THEN 'operator' ELSE 'backup' END
FROM (
  SELECT id, row_number() OVER (ORDER BY full_name) AS rn
  FROM public.employees
  WHERE status = 'active'
  LIMIT 14
) AS e
CROSS JOIN LATERAL (
  SELECT rn AS r FROM (SELECT row_number() OVER () AS rn FROM public.employees WHERE status = 'active' LIMIT 14) sub WHERE sub.rn = e.rn
) AS rn
JOIN (
  SELECT id, row_number() OVER (ORDER BY type, name) AS rn
  FROM public.workstations
  WHERE type <> 'pre_press'
) AS w ON w.rn = ((e.rn - 1) % (SELECT count(*) FROM public.workstations WHERE type <> 'pre_press')) + 1
JOIN (
  SELECT id FROM public.shifts
  WHERE name ILIKE 'Turno Mañana' OR name ILIKE 'Morning Shift'
  ORDER BY created_at DESC LIMIT 1
) AS s ON true;

-- Verify
SELECT type, name FROM public.workstations ORDER BY type, name;
SELECT count(*) AS assignments_today FROM public.worker_assignments WHERE date = CURRENT_DATE;

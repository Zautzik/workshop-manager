-- =====================================================
-- Corrective machine seed + Planta linking
-- Ensures baseline fleet exists (including 2 Ryobi + 1 Roland)
-- and links unassigned machines to open workstations.
-- =====================================================

-- 1) Ensure target fleet exists (idempotent by name)
WITH seed_machines AS (
  SELECT *
  FROM (
    VALUES
      -- Offset printers (requested mix)
      ('Ryobi Offset 524GS #1'::text, 'offset_printer'::public.machine_type, 'idle'::public.machine_status, 'Ryobi'::text,  '524GS'::text, 'Prensa offset Ryobi (semilla inicial; completar especificaciones).'::text, 'Planta - Offset'::text),
      ('Ryobi Offset 524GS #2'::text, 'offset_printer'::public.machine_type, 'idle'::public.machine_status, 'Ryobi'::text,  '524GS'::text, 'Prensa offset Ryobi (semilla inicial; completar especificaciones).'::text, 'Planta - Offset'::text),
      ('Roland Offset #1'::text,     'offset_printer'::public.machine_type, 'idle'::public.machine_status, 'Roland'::text, NULL::text,  'Prensa offset Roland (semilla inicial; completar especificaciones).'::text, 'Planta - Offset'::text),

      -- Die cutter
      ('Die Cutter #1'::text, 'die_cutter'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Troqueladora (semilla inicial; completar especificaciones).'::text, 'Planta - Troquelado'::text),

      -- Guillotines
      ('Guillotine #1'::text, 'guillotine'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Guillotina (semilla inicial; completar especificaciones).'::text, 'Planta - Corte'::text),
      ('Guillotine #2'::text, 'guillotine'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Guillotina (semilla inicial; completar especificaciones).'::text, 'Planta - Corte'::text),
      ('Guillotine #3'::text, 'guillotine'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Guillotina (semilla inicial; completar especificaciones).'::text, 'Planta - Corte'::text),

      -- Manual workstations
      ('Manual Workstation #1'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),
      ('Manual Workstation #2'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),
      ('Manual Workstation #3'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),
      ('Manual Workstation #4'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),
      ('Manual Workstation #5'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),
      ('Manual Workstation #6'::text, 'manual_workshop'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Puesto manual de terminaciones (semilla inicial; completar especificaciones).'::text, 'Taller Manual'::text),

      -- Dispatch vehicles
      ('Dispatch Vehicle #1'::text, 'delivery'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Vehículo de despacho (semilla inicial; completar especificaciones).'::text, 'Despacho'::text),
      ('Dispatch Vehicle #2'::text, 'delivery'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Vehículo de despacho (semilla inicial; completar especificaciones).'::text, 'Despacho'::text),
      ('Dispatch Vehicle #3'::text, 'delivery'::public.machine_type, 'idle'::public.machine_status, NULL::text, NULL::text, 'Vehículo de despacho (semilla inicial; completar especificaciones).'::text, 'Despacho'::text)
  ) AS s(name, type, status, brand, model, description, location)
)
INSERT INTO public.machines (
  name,
  type,
  status,
  brand,
  model,
  description,
  location,
  is_active
)
SELECT
  s.name,
  s.type,
  s.status,
  s.brand,
  s.model,
  s.description,
  s.location,
  TRUE
FROM seed_machines s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.machines m
  WHERE lower(m.name) = lower(s.name)
);

-- 2) Optional normalization: if an old generic "Offset Printer 3" exists and Roland does not, convert it
UPDATE public.machines m
SET
  name = 'Roland Offset #1',
  type = 'offset_printer'::public.machine_type,
  brand = COALESCE(m.brand, 'Roland'),
  model = COALESCE(m.model, NULL),
  is_active = TRUE,
  updated_at = now()
WHERE lower(m.name) = lower('Offset Printer 3')
  AND NOT EXISTS (
    SELECT 1 FROM public.machines x WHERE lower(x.name) = lower('Roland Offset #1')
  );

-- 3) Auto-link unassigned active machines to available workstations (for Planta Integrada)
WITH workstation_pool AS (
  SELECT
    ws.id,
    ws.type,
    row_number() OVER (PARTITION BY ws.type ORDER BY ws.name, ws.id) AS rn
  FROM public.workstations ws
  WHERE ws.machine_id IS NULL
),
machine_pool AS (
  SELECT
    m.id,
    CASE
      WHEN m.type::text = 'manual_workshop' THEN 'workshop'
      ELSE m.type::text
    END AS ws_type,
    row_number() OVER (
      PARTITION BY CASE WHEN m.type::text = 'manual_workshop' THEN 'workshop' ELSE m.type::text END
      ORDER BY m.name, m.id
    ) AS rn
  FROM public.machines m
  WHERE m.is_active = TRUE
    AND m.workstation_id IS NULL
)
UPDATE public.workstations ws
SET
  machine_id = mp.id,
  updated_at = now()
FROM workstation_pool wp
JOIN machine_pool mp
  ON mp.ws_type = wp.type
 AND mp.rn = wp.rn
WHERE ws.id = wp.id
  AND ws.machine_id IS NULL;

-- 4) Keep reverse link in sync
UPDATE public.machines m
SET
  workstation_id = ws.id,
  updated_at = now()
FROM public.workstations ws
WHERE ws.machine_id = m.id
  AND m.workstation_id IS DISTINCT FROM ws.id;

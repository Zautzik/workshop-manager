-- =====================================================
-- Seed baseline Machine fleet for Workshop
-- 2 Ryobi Offset, 1 Die Cutter, 3 Guillotines,
-- 6 Manual Workstations, 3 Dispatch Vehicles
-- =====================================================

WITH seed_machines AS (
  SELECT *
  FROM (
    VALUES
      -- Offset (Ryobi)
      ('Ryobi Offset 524GS #1'::text, 'offset_printer'::public.machine_type, 'idle'::public.machine_status, 'Ryobi'::text, '524GS'::text, 'Prensa offset Ryobi (semilla inicial; completar especificaciones).'::text, 'Planta - Offset'::text),
      ('Ryobi Offset 524GS #2'::text, 'offset_printer'::public.machine_type, 'idle'::public.machine_status, 'Ryobi'::text, '524GS'::text, 'Prensa offset Ryobi (semilla inicial; completar especificaciones).'::text, 'Planta - Offset'::text),

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

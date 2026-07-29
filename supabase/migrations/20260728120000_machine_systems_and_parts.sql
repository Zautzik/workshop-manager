-- Mecánica y abastecimiento por sistema de máquina.
--
-- Hasta ahora una máquina era una ficha plana. El mecánico piensa distinto:
-- primero el sistema (hidráulico, entintado, aire comprimido) y recién dentro
-- la pieza. Y los repuestos son escasos: lo que importa no es sólo qué pieza es,
-- sino cuánto demora en llegar y qué pasa con el taller mientras no está.
--
-- DECISIÓN: los repuestos NO tienen inventario propio. `inventory_items` ya
-- tiene la categoría 'spare_part', con lotes, transacciones y compras que
-- funcionan. Duplicar eso sería crear la segunda puerta que este proyecto lleva
-- meses cerrando. Lo que se agrega es la jerarquía y la inteligencia de compra.
--
-- CONTADOR FLEXIBLE: la Ryobi 524GS se mantiene por impresiones; la Roland por
-- horas; una camioneta por kilómetros. Una sola columna de frecuencia en días
-- no describe ninguna de las tres. Ahora cada máquina declara su unidad y su
-- contador, y las pautas y vidas útiles se expresan en esa unidad.

-- ── 1. Unidad de uso por máquina ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.machine_usage_unit AS ENUM ('impressions', 'hours', 'kilometers', 'cycles');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS usage_unit public.machine_usage_unit NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS usage_counter NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_counter_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.machines.usage_unit IS
  'Cómo se mide el desgaste de esta máquina. Offset por impressions, Roland y compresores por hours, vehículos por kilometers. Las pautas y las vidas útiles de repuesto se expresan en esta unidad.';
COMMENT ON COLUMN public.machines.usage_counter IS
  'Lectura actual del contador, en usage_unit. Es lo que hace que una pauta venza por uso y no por calendario.';

-- Las dos Ryobi se miden en impresiones; el resto queda en horas por defecto.
UPDATE public.machines
   SET usage_unit = 'impressions'
 WHERE type = 'offset_printer' AND usage_unit = 'hours';

UPDATE public.machines
   SET usage_unit = 'kilometers'
 WHERE type = 'delivery' AND usage_unit = 'hours';

-- ── 2. Sistemas: el primer nivel del árbol ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.machine_systems (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  -- NULL = aplica a cualquier clase de máquina.
  applies_to   public.machine_type[],
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.machine_systems IS
  'Grandes grupos mecánicos. El mecánico entra por el sistema y baja a la pieza, no al revés.';

INSERT INTO public.machine_systems (code, name, description, applies_to, sort_order) VALUES
  ('motriz',       'Sistema motriz',        'Motor principal, transmisión, correas, reductores', NULL, 10),
  ('hidraulico',   'Sistema hidráulico',    'Bomba, mangueras, cilindros, válvulas, aceite',     NULL, 20),
  ('neumatico',    'Aire comprimido',       'Compresor, filtros, reguladores, mangueras, ventosas', NULL, 30),
  ('electrico',    'Sistema eléctrico',     'Tablero, motores, contactores, cableado, sensores', NULL, 40),
  ('control',      'Control y electrónica', 'PLC, pantalla, tarjetas, encoders',                 NULL, 50),
  ('lubricacion',  'Lubricación',           'Bomba de engrase, puntos, líneas, grasa y aceites', NULL, 60),
  ('refrigeracion','Refrigeración',         'Chiller, radiadores, circulación de agua',          NULL, 70),
  ('entintado',    'Sistema de entintado',  'Rodillos entintadores, tinteros, calibración',      ARRAY['offset_printer']::public.machine_type[], 80),
  ('mojado',       'Sistema de mojado',     'Rodillos de agua, solución fuente, dosificación',   ARRAY['offset_printer']::public.machine_type[], 90),
  ('mantillas',    'Mantillas y cilindros', 'Mantillas, cilindros porta-plancha e impresor',     ARRAY['offset_printer']::public.machine_type[], 100),
  ('transporte',   'Transporte de pliego',  'Marcador, pinzas, cintas, succión, salida',         ARRAY['offset_printer','digital_printer','die_cutter']::public.machine_type[], 110),
  ('corte',        'Sistema de corte',      'Cuchilla, pisón, escuadra, mesa de aire',           ARRAY['guillotine']::public.machine_type[], 120),
  ('troquelado',   'Sistema de troquelado', 'Platina, contramatriz, expulsión',                  ARRAY['die_cutter']::public.machine_type[], 130),
  ('rodadura',     'Rodadura y frenos',     'Neumáticos, frenos, suspensión',                    ARRAY['delivery']::public.machine_type[], 140),
  ('seguridad',    'Seguridad',             'Paradas de emergencia, guardas, enclavamientos',    NULL, 150)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Piezas: el detalle, colgando del sistema ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.machine_parts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id        UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  system_id         UUID NOT NULL REFERENCES public.machine_systems(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  part_number       TEXT,
  position          TEXT,                    -- "cuerpo 3", "lado operador"
  quantity_installed NUMERIC NOT NULL DEFAULT 1,

  -- Vínculo con el stock real. NULL = pieza conocida que aún no se inventaría.
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,

  -- ── Abastecimiento: lo que decide si el taller se detiene o no ──
  criticality       TEXT NOT NULL DEFAULT 'media'
                    CHECK (criticality IN ('critica', 'alta', 'media', 'baja')),
  lead_time_days    INTEGER,                 -- cuánto demora en llegar
  preferred_supplier TEXT,
  supplier_part_ref TEXT,
  min_stock         NUMERIC NOT NULL DEFAULT 0,
  unit_cost         NUMERIC,
  is_imported       BOOLEAN NOT NULL DEFAULT false,

  -- ── Vida útil, en la unidad de uso de LA MÁQUINA ──
  expected_life_usage NUMERIC,               -- ej. 8.000.000 impresiones, 4.000 horas
  last_replaced_at    TIMESTAMPTZ,
  last_replaced_usage NUMERIC,               -- lectura del contador al cambiarla

  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_parts_machine ON public.machine_parts (machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_parts_system  ON public.machine_parts (system_id);
CREATE INDEX IF NOT EXISTS idx_machine_parts_item    ON public.machine_parts (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_machine_parts_critica ON public.machine_parts (criticality)
  WHERE criticality IN ('critica', 'alta');

COMMENT ON TABLE public.machine_parts IS
  'Piezas de cada máquina, colgando de su sistema. No es un inventario paralelo: el stock vive en inventory_items (categoría spare_part) y acá se guarda la jerarquía, la criticidad y el plazo de reposición.';
COMMENT ON COLUMN public.machine_parts.expected_life_usage IS
  'Vida útil esperada expresada en la usage_unit de la máquina (impresiones para una offset, horas para una Roland o un compresor, km para un vehículo).';
COMMENT ON COLUMN public.machine_parts.lead_time_days IS
  'Días de reposición. Con repuestos escasos, este número —no el precio— decide cuánto stock mínimo tener.';

-- ── 4. Pautas que vencen por uso, no sólo por calendario ────────────────────
ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS frequency_usage NUMERIC,
  ADD COLUMN IF NOT EXISTS last_maintenance_usage NUMERIC,
  ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES public.machine_systems(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.maintenance_schedules.frequency_usage IS
  'Cada cuánto uso vence la pauta, en la usage_unit de la máquina. Convive con frequency_days: vence lo que ocurra PRIMERO. Una Ryobi se lubrica cada N impresiones; una Roland cada N horas; y si la máquina estuvo parada, el calendario igual la hace vencer.';

-- ── 5. Vista de salud de repuesto ───────────────────────────────────────────
-- Responde la pregunta del mecánico: qué pieza está por vencer y si alcanzo a
-- pedirla antes de que se caiga la máquina.
CREATE OR REPLACE VIEW public.machine_parts_health_v AS
SELECT
  p.id,
  p.machine_id,
  m.name        AS machine_name,
  m.usage_unit,
  m.usage_counter,
  s.code        AS system_code,
  s.name        AS system_name,
  p.name,
  p.part_number,
  p.criticality,
  p.lead_time_days,
  p.min_stock,
  p.expected_life_usage,
  p.last_replaced_usage,
  -- Uso acumulado desde el último cambio.
  CASE
    WHEN p.last_replaced_usage IS NOT NULL THEN GREATEST(0, m.usage_counter - p.last_replaced_usage)
    ELSE m.usage_counter
  END AS usage_since_replacement,
  -- Porcentaje de vida consumida (NULL si no se declaró vida útil).
  CASE
    WHEN p.expected_life_usage IS NULL OR p.expected_life_usage <= 0 THEN NULL
    ELSE ROUND(
      (CASE
         WHEN p.last_replaced_usage IS NOT NULL THEN GREATEST(0, m.usage_counter - p.last_replaced_usage)
         ELSE m.usage_counter
       END / p.expected_life_usage) * 100, 1)
  END AS life_used_pct,
  p.inventory_item_id,
  p.preferred_supplier,
  p.is_imported
FROM public.machine_parts p
JOIN public.machines m        ON m.id = p.machine_id
JOIN public.machine_systems s ON s.id = p.system_id
WHERE p.is_active;

COMMENT ON VIEW public.machine_parts_health_v IS
  'Vida consumida de cada pieza según el contador de su máquina. Con lead_time_days al lado, dice si todavía se alcanza a pedir.';

GRANT SELECT ON public.machine_parts_health_v TO authenticated;

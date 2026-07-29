-- Bitácora del contador de cada máquina.
--
-- Un contador sin historia sólo dice DÓNDE está la máquina. La pregunta que de
-- verdad importa con repuestos escasos es otra: "esta pieza aguanta 40 días más
-- y el repuesto demora 60 en llegar — ¿ya voy tarde?". Eso exige un RITMO, y un
-- ritmo exige al menos dos lecturas.
--
-- Además es la trazabilidad del número: quién anotó 8.400.000 impresiones y
-- cuándo. Un contador que cualquiera puede sobrescribir sin dejar rastro no
-- sirve para decidir compras.

CREATE TABLE IF NOT EXISTS public.machine_usage_readings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  reading      NUMERIC NOT NULL CHECK (reading >= 0),
  -- Copia de la unidad al momento de la lectura: si mañana alguien cambia la
  -- unidad de la máquina, la historia no se reinterpreta sola.
  unit         public.machine_usage_unit NOT NULL,
  read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual', 'qr', 'production', 'import')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_usage_readings_machine
  ON public.machine_usage_readings (machine_id, read_at DESC);

COMMENT ON TABLE public.machine_usage_readings IS
  'Lecturas sucesivas del contador. Dos lecturas dan el ritmo de consumo; el ritmo convierte una vida útil en una FECHA, y una fecha comparada con el lead time dice si todavía se alcanza a comprar.';

-- Ritmo de uso por máquina, sobre los últimos 90 días.
CREATE OR REPLACE VIEW public.machine_usage_rate_v AS
WITH ventana AS (
  SELECT
    machine_id,
    MIN(read_at)  AS desde,
    MAX(read_at)  AS hasta,
    MIN(reading)  AS reading_min,
    MAX(reading)  AS reading_max,
    COUNT(*)      AS lecturas
  FROM public.machine_usage_readings
  WHERE read_at >= now() - INTERVAL '90 days'
  GROUP BY machine_id
)
SELECT
  v.machine_id,
  v.lecturas,
  v.desde,
  v.hasta,
  GREATEST(0, v.reading_max - v.reading_min) AS uso_periodo,
  EXTRACT(EPOCH FROM (v.hasta - v.desde)) / 86400.0 AS dias_periodo,
  -- NULL cuando hay una sola lectura o todas el mismo día: preferimos no saber
  -- antes que inventar un ritmo con un solo punto.
  CASE
    WHEN v.lecturas < 2 THEN NULL
    WHEN EXTRACT(EPOCH FROM (v.hasta - v.desde)) < 86400 THEN NULL
    ELSE (v.reading_max - v.reading_min) / (EXTRACT(EPOCH FROM (v.hasta - v.desde)) / 86400.0)
  END AS uso_por_dia
FROM ventana v;

COMMENT ON VIEW public.machine_usage_rate_v IS
  'Uso por día de cada máquina en los últimos 90 días. Devuelve NULL —no un cero ni una adivinanza— cuando no hay lecturas suficientes.';

GRANT SELECT ON public.machine_usage_rate_v TO authenticated;

-- Sembrar la primera lectura con el contador actual, para que la bitácora
-- arranque desde el estado real y no desde cero.
INSERT INTO public.machine_usage_readings (machine_id, reading, unit, read_at, source, notes)
SELECT id, usage_counter, usage_unit, COALESCE(usage_counter_updated_at, now()), 'import',
       'Lectura inicial al habilitar la bitácora de contador'
  FROM public.machines
 WHERE usage_counter > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.machine_usage_readings r WHERE r.machine_id = machines.id
   );

-- Mantener machines.usage_counter en sincronía con la última lectura, para que
-- no existan dos verdades sobre el mismo número.
CREATE OR REPLACE FUNCTION public.sync_machine_usage_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.machines
     SET usage_counter = NEW.reading,
         usage_counter_updated_at = NEW.read_at
   WHERE id = NEW.machine_id
     AND (usage_counter_updated_at IS NULL OR NEW.read_at >= usage_counter_updated_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_machine_usage_counter ON public.machine_usage_readings;
CREATE TRIGGER trg_sync_machine_usage_counter
  AFTER INSERT ON public.machine_usage_readings
  FOR EACH ROW EXECUTE FUNCTION public.sync_machine_usage_counter();

ALTER TABLE public.machine_usage_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_parts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_systems        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lectura autenticada" ON public.machine_usage_readings
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lectura autenticada" ON public.machine_parts
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lectura autenticada" ON public.machine_systems
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

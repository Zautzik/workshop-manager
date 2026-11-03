-- Los turnos son definiciones, y cada máquina tiene su patrón
--
-- ── Lo que había ────────────────────────────────────────────────────────────
--
-- `shifts` nació como catálogo (Morning 08–16, Afternoon 16–00) y, sin una
-- pantalla para editarlo, se usó como bitácora: 503 filas el 2026-10-27, casi
-- todas copias por día o por incidente — «Turno Día CRUNCH — 11 Mar 2026
-- (⚠ Avería Ryobi #1)». Planta las agrupaba adivinando por el nombre en «Día» y
-- «Tarde» (el Turno Noche 23–07 caía en «Tarde»), y nada decía qué máquina
-- trabaja qué turno: el Cronograma tuvo que suponerlo en el código.
--
-- ── Lo que queda ────────────────────────────────────────────────────────────
--
-- 1. Cuatro DEFINICIONES (`code` no nulo): Mañana 07–14, Tarde 14–22,
--    Noche 22–07 y Taller 07–16. Son lo que ofrecen Planta y el Cronograma.
--
-- 2. Las 503 filas viejas se ARCHIVAN (`archived_at`), no se borran ni se
--    remapean. Las asignaciones pasadas siguen apuntando a ellas a propósito:
--    la nómina (`monthly_payroll_calculator`, `employee_cost_timeline`) y la
--    compuerta de cumplimiento calculan horas desde `shifts.start_time/
--    end_time`, y mover una asignación de «07–15» a «Mañana 07–14» le quitaría
--    una hora a un sueldo ya pagado. Los nombres con fecha e incidente quedan
--    intactos como el registro que eran.
--
-- 3. `machine_shift_patterns`: qué turnos trabaja NORMALMENTE cada máquina y
--    qué días. Es lo que el Cronograma usa cuando no hay dotación cargada para
--    ese día. Cuando la hay (`worker_assignments`), manda la dotación: así se
--    abre un turno de noche — asignando operarios en Planta.
--
-- El patrón inicial es el que declaró la planta: todo Mañana + Tarde de lunes a
-- viernes, el taller manual en Taller, y la Noche sin máquinas por defecto.

BEGIN;

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS code        TEXT;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shifts.code IS
  'Identificador estable de una definición de turno (manana, tarde, noche, taller). NULL en las filas históricas.';
COMMENT ON COLUMN public.shifts.archived_at IS
  'Fila histórica: no se ofrece para asignar, pero las asignaciones pasadas la siguen usando (horas de nómina).';

-- Primero archivar todo lo que no es definición, después crear las definiciones.
UPDATE public.shifts SET archived_at = now() WHERE code IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_code_vigente
  ON public.shifts (code) WHERE code IS NOT NULL AND archived_at IS NULL;

INSERT INTO public.shifts (name, start_time, end_time, is_night_shift, code, sort_order)
SELECT v.name, v.start_time::time, v.end_time::time, v.is_night, v.code, v.sort_order
FROM (VALUES
  ('Mañana', '07:00', '14:00', false, 'manana', 1),
  ('Tarde',  '14:00', '22:00', false, 'tarde',  2),
  ('Noche',  '22:00', '07:00', true,  'noche',  3),
  ('Taller', '07:00', '16:00', false, 'taller', 4)
) AS v(name, start_time, end_time, is_night, code, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shifts s WHERE s.code = v.code AND s.archived_at IS NULL
);

CREATE TABLE IF NOT EXISTS public.machine_shift_patterns (
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  shift_id   UUID NOT NULL REFERENCES public.shifts(id)   ON DELETE CASCADE,
  -- 0 = domingo … 6 = sábado.
  weekdays   SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (machine_id, shift_id),
  CONSTRAINT machine_shift_patterns_dias_validos
    CHECK (weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] AND cardinality(weekdays) > 0)
);

COMMENT ON TABLE public.machine_shift_patterns IS
  'Qué turnos trabaja normalmente cada máquina y qué días. El Cronograma lo usa cuando no hay dotación (worker_assignments) para esa máquina ese día.';

-- Las rutas escriben con service_role (que salta RLS); sin políticas a propósito,
-- igual que las tablas de la remediación 2026-10.
ALTER TABLE public.machine_shift_patterns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_machine_shift_patterns_updated_at ON public.machine_shift_patterns;
CREATE TRIGGER update_machine_shift_patterns_updated_at
  BEFORE UPDATE ON public.machine_shift_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Patrón inicial: taller manual en Taller; todo lo demás Mañana + Tarde.
INSERT INTO public.machine_shift_patterns (machine_id, shift_id)
SELECT m.id, s.id
FROM public.machines m
JOIN public.shifts s
  ON s.archived_at IS NULL
 AND s.code = ANY (CASE WHEN m.type = 'manual_workshop' THEN ARRAY['taller'] ELSE ARRAY['manana', 'tarde'] END)
WHERE m.is_active
ON CONFLICT (machine_id, shift_id) DO NOTHING;

COMMIT;

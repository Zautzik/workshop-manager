-- Los equipos rotan solos
--
-- ── Lo que había ────────────────────────────────────────────────────────────
--
-- La planta trabaja con dos cuadrillas de prensa que se cambian Mañana ⇄ Tarde
-- cada lunes, y guillotineros y troqueladores que rotan de a uno. Para cargarlo,
-- Planta pedía elegir día, turno y arrastrar persona por persona: ~30 arrastres
-- por semana para un patrón que nunca cambia. Lo único parecido era la rotación
-- de sábados (una persona por semana, en `app_settings`).
--
-- ── Lo que queda ────────────────────────────────────────────────────────────
--
-- 1. `shift_rotations`: un grupo de equipos que se reparte una lista ordenada de
--    turnos, en ciertos días, y avanza una posición cada lunes. Opcional: el
--    equipo que esa semana hace `saturday_shift_id` también lo trabaja el sábado.
--    La regla vive en `src/lib/shift-rotation.ts` (con pruebas).
-- 2. `rotation_teams` y `rotation_members`: cada equipo es una lista de
--    «persona → máquina». Un guillotinero solo es un equipo de una persona.
-- 3. `rotation_skips`: un turno de rotación que alguien quitó a mano. Regenerar no
--    lo vuelve a poner.
-- 4. `worker_assignments.source` / `rotation_id`: de dónde salió cada turno. La
--    rotación escribe filas normales —las mismas que leen el Kanban, el
--    Cronograma y la nómina— marcadas 'rotacion'. Regenerar sólo reemplaza esas,
--    y sólo de hoy en adelante: un cambio hecho a mano ('manual') nunca se pisa.
--    Las filas existentes quedan 'manual', que es lo que son.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shift_rotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  -- Definiciones de `shifts`, en el orden en que se recorren. Un arreglo no
  -- admite FK: la ruta valida que sean definiciones vigentes.
  shift_ids         UUID[] NOT NULL CHECK (cardinality(shift_ids) BETWEEN 1 AND 4),
  weekdays          SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}'
                    CHECK (weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] AND cardinality(weekdays) > 0),
  saturday_shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  -- Lunes de la semana de referencia: ese lunes el equipo 0 hace el primer turno.
  anchor_week       DATE NOT NULL CHECK (EXTRACT(ISODOW FROM anchor_week) = 1),
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rotation_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id UUID NOT NULL REFERENCES public.shift_rotations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  position    SMALLINT NOT NULL CHECK (position >= 0),
  UNIQUE (rotation_id, position)
);

CREATE TABLE IF NOT EXISTS public.rotation_members (
  team_id     UUID NOT NULL REFERENCES public.rotation_teams(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  machine_id  UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'Operador',
  PRIMARY KEY (team_id, employee_id, machine_id)
);

-- Un turno de rotación que alguien QUITÓ a mano (faltó, se cambió de día). Sin
-- esto, regenerar lo volvería a poner. El generador salta estos días.
CREATE TABLE IF NOT EXISTS public.rotation_skips (
  rotation_id UUID NOT NULL REFERENCES public.shift_rotations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rotation_id, employee_id, date)
);

COMMENT ON TABLE public.shift_rotations IS
  'Equipos que se reparten turnos y avanzan cada lunes. Regla en src/lib/shift-rotation.ts.';

-- Las rutas escriben con service_role (que salta RLS); sin políticas a propósito.
ALTER TABLE public.shift_rotations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_skips   ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shift_rotations_updated_at ON public.shift_rotations;
CREATE TRIGGER update_shift_rotations_updated_at
  BEFORE UPDATE ON public.shift_rotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.worker_assignments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS rotation_id UUID REFERENCES public.shift_rotations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_assignments_source_valida') THEN
    ALTER TABLE public.worker_assignments ADD CONSTRAINT worker_assignments_source_valida
      CHECK (source IN ('manual', 'rotacion'));
  END IF;
END $$;

COMMENT ON COLUMN public.worker_assignments.source IS
  '''rotacion'' si la generó una rotación (se puede regenerar), ''manual'' si la cargó una persona (no se pisa).';

CREATE INDEX IF NOT EXISTS worker_assignments_rotation_date
  ON public.worker_assignments (rotation_id, date) WHERE rotation_id IS NOT NULL;

COMMIT;

-- Sistemas de las máquinas de terminación, y la competencia como requisito real.
--
-- Dos cosas van juntas acá a propósito, porque en el taller son la misma cosa:
-- una máquina sin repuestos se para, y una máquina sin nadie que la sepa operar
-- también se para. La segunda es el riesgo que hoy nadie mide: hay máquinas que
-- sólo un par de personas sabe correr, y eso no aparece en ninguna pantalla
-- hasta que esa persona toma vacaciones.

-- ── 1. Sistemas propios de cada máquina de terminación ──────────────────────
INSERT INTO public.machine_systems (code, name, description, applies_to, sort_order) VALUES
  ('plegado',     'Bolsas y cuchillas de plegado', 'Bolsas, cuchillas, topes y escuadras de plegado',
     ARRAY['folder']::public.machine_type[], 200),
  ('arrastre',    'Rodillos de arrastre',          'Rodillos de goma, presión y alineación del pliego',
     ARRAY['folder','laminator','collator']::public.machine_type[], 210),
  ('alzado',      'Torres de alzado',              'Estaciones, ventosas y sensores de doble pliego',
     ARRAY['collator']::public.machine_type[], 220),
  ('corchete',    'Cabezales de corchete',         'Cabezales, formadores, alimentación de alambre y yunque',
     ARRAY['stitcher']::public.machine_type[], 230),
  ('encolado',    'Encolado y hotmelt',            'Olla de cola, resistencias, control de temperatura, rodillos aplicadores',
     ARRAY['perfect_binder']::public.machine_type[], 240),
  ('fresado',     'Fresado de lomo',               'Fresa, cuchillas de lomo, aspiración de polvillo',
     ARRAY['perfect_binder']::public.machine_type[], 250),
  ('mordazas',    'Mordazas y transporte de libro', 'Pinzas, mordazas, cadena de transporte',
     ARRAY['perfect_binder']::public.machine_type[], 260),
  ('termico',     'Sistema térmico',               'Resistencias, termocuplas, controladores de temperatura',
     ARRAY['laminator','perfect_binder']::public.machine_type[], 270),
  ('bobina',      'Bobina y tensión de film',      'Portabobinas, frenos, control de tensión, rebobinador',
     ARRAY['laminator']::public.machine_type[], 280)
ON CONFLICT (code) DO NOTHING;

-- Las máquinas de terminación se miden en horas de trabajo, no en impresiones.
UPDATE public.machines
   SET usage_unit = 'hours'
 WHERE type IN ('folder','collator','stitcher','perfect_binder','laminator')
   AND usage_unit <> 'hours';

-- ── 2. La competencia como requisito con fecha ──────────────────────────────
-- `machine_skill_requirements` ya existía y estaba VACÍA: la app sabía
-- preguntar "¿puede este operario correr esta máquina?" y la respuesta siempre
-- era que sí, porque no había ni un requisito declarado. Estas columnas la
-- vuelven utilizable de verdad.
ALTER TABLE public.machine_skill_requirements
  -- Habilita a operar solo, sin supervisión. Distinto de "sabe algo del tema".
  ADD COLUMN IF NOT EXISTS requires_certification BOOLEAN NOT NULL DEFAULT false,
  -- Horas acompañado antes de quedar habilitado.
  ADD COLUMN IF NOT EXISTS supervised_hours_required NUMERIC,
  -- Cuántas personas DEBERÍAN saber operarla. El taller decide su propio
  -- umbral de riesgo; sin esto, "sólo dos saben" no es un dato, es una anécdota.
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.machine_skill_requirements.requires_certification IS
  'Si es true, no basta con alcanzar el nivel: hace falta la certificación firmada por un evaluador para operar sin supervisión.';

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS min_qualified_operators INTEGER NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.machines.min_qualified_operators IS
  'Cuántos operarios habilitados debería haber para esta máquina. Por debajo de este número el taller depende de una persona: es el factor bus, y acá se vuelve medible en vez de anecdótico.';

-- ── 3. Ruta de desarrollo por máquina ───────────────────────────────────────
-- El grafo de prerrequisitos (skill_dependencies) y la escalera de niveles
-- (skill_proficiency_levels) ya existen y describen CÓMO se aprende. Lo que
-- faltaba es el plan concreto: qué hace esta persona, en qué orden, con quién,
-- para llegar a operar ESTA máquina.
CREATE TABLE IF NOT EXISTS public.machine_training_paths (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL DEFAULT 1,
  title         TEXT NOT NULL,
  description   TEXT,
  -- Qué habilidad avanza este paso, y hasta qué nivel.
  skill_id      UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  target_proficiency INTEGER,
  estimated_hours NUMERIC,
  -- Material de apoyo que ya vive en el módulo de capacitación.
  training_article_id UUID REFERENCES public.training_articles(id) ON DELETE SET NULL,
  -- Quién puede enseñar este paso. NULL = cualquiera que esté certificado.
  mentor_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_training_paths_machine
  ON public.machine_training_paths (machine_id, step_order);

COMMENT ON TABLE public.machine_training_paths IS
  'Ruta concreta para que alguien nuevo llegue a operar una máquina: pasos ordenados, horas estimadas, mentor y material. Se apoya en skills y training_articles en vez de duplicarlos.';

-- Avance de cada persona por esa ruta.
CREATE TABLE IF NOT EXISTS public.machine_training_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id      UUID NOT NULL REFERENCES public.machine_training_paths(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (status IN ('pendiente', 'en_curso', 'completado', 'validado')),
  hours_logged NUMERIC NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  validated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  evidence_url TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_training_progress_emp
  ON public.machine_training_progress (employee_id);

COMMENT ON TABLE public.machine_training_progress IS
  'Dónde va cada persona en la ruta de una máquina. "validado" lo pone un evaluador, no el propio aprendiz.';

ALTER TABLE public.machine_training_paths    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_training_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lectura autenticada" ON public.machine_training_paths
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lectura autenticada" ON public.machine_training_progress
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

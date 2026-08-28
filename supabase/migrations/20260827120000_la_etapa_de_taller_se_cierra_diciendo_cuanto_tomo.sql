-- La etapa de taller se cierra diciendo cuánto tomó
--
-- Cuando una OT sale de la guillotina, de la prensa o del troquel, lo único que
-- quedaba registrado era que CAMBIÓ DE COLUMNA. Cuánto tomó el trabajo, cuántos
-- pliegos se arruinaron y qué se rompió a mitad de tiraje vivían en la cabeza
-- del operario y en la memoria del jefe de taller.
--
-- El agujero no es de prolijidad. `machines` sabe lo que cuesta una hora de cada
-- máquina —energía, mantención, depreciación— y ese número no tenía por qué
-- multiplicarse: el costo real de una OT cargaba materiales y tercerizados, y el
-- tiempo, que es el recurso más caro y el único que no se puede recomprar,
-- entraba en cero. Y `merma` sabe juzgar una tasa de desperdicio contra el
-- tiraje, pero nadie declaraba el desperdicio por etapa, así que cuando el
-- margen aparecía bajo no se podía decir DÓNDE se había perdido.
--
-- ── Por qué una tabla y no una columna de `ots` ─────────────────────────────
--
-- Una OT pasa por varias etapas de taller, y una misma etapa puede cerrarse más
-- de una vez: el Kanban permite mover una parte del trabajo al proceso siguiente
-- —tres mil de seis mil— y el resto sale mañana, en otra pasada, con sus propias
-- horas y su propia merma. Un total en la OT no puede representar eso, y un
-- promedio esconde justamente la pasada que salió mal.
--
-- ── Por qué no vive en `ot_real_costs` ──────────────────────────────────────
--
-- Ahí se guarda PLATA por línea de operación, y estas horas todavía no son
-- plata: se vuelven plata cuando alguien las multiplica por la tarifa de la
-- máquina, y esa tarifa cambia con el tiempo. Guardar el hecho —tantas horas,
-- tantos pliegos perdidos— separado de su valorización deja recalcular el costo
-- cuando la tarifa se corrige, sin reescribir la historia del taller.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ot_stage_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id         UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,

  -- La etapa que TERMINA, no la que empieza. El cierre habla del trabajo hecho.
  workflow_step public.ot_status NOT NULL,
  to_status     public.ot_status,

  -- El dato que justifica todo el formulario.
  hours         NUMERIC(8,2) NOT NULL,

  -- Cuántas unidades salieron en esta pasada. Con avances parciales, dos
  -- cierres de la misma etapa se distinguen por acá.
  units_moved   INTEGER,

  -- La máquina que lo hizo, si se sabe. Es lo que convierte las horas en plata
  -- (`machine-economics`), así que se guarda aunque hoy se llene sola desde la
  -- máquina asignada a la OT.
  machine_id    UUID REFERENCES public.machines(id) ON DELETE SET NULL,

  -- Pliegos que entraron a la máquina y no salieron vendibles. `merma` los
  -- juzga contra el tiraje: 8% en 500 pliegos es el arreglo, 8% en 100.000 es
  -- una máquina con un problema.
  merma_sheets  INTEGER,

  -- Los tres textos del operario. Separados a propósito: «se rompió la cuchilla»
  -- y «el papel venía ondulado» se buscan distinto y se corrigen distinto. Un
  -- solo campo de notas los mezcla y después no se puede filtrar por ninguno.
  waste_notes   TEXT,
  issues        TEXT,
  observations  TEXT,

  recorded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Las reglas van en la base y no sólo en la API: un cierre que se puede escribir
-- mal por otra vía deja de servir como historia para estimar la próxima OT.

-- Cero horas es «no lo medí» disfrazado de dato, y contamina cualquier promedio.
DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_horas_positivas
    CHECK (hours > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- El tope es un cazador de tipeos, no una regla de negocio: el error real es
-- escribir minutos en el campo de horas —480 por ocho— y un 480 que entra en
-- silencio arruina el costo de la OT y el histórico de la máquina. Tres turnos
-- por cinco días son 120 h; 400 deja lugar de sobra. Debe coincidir con
-- MAX_HORAS_POR_ETAPA en src/lib/stage-report.ts.
DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_horas_creibles
    CHECK (hours <= 400);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_merma_no_negativa
    CHECK (merma_sheets IS NULL OR merma_sheets >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_unidades_positivas
    CHECK (units_moved IS NULL OR units_moved > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Las etapas que corre este taller. Tercerizado queda afuera —las horas son de
-- otro taller y su costo viene en su factura—, igual que diseño, compras,
-- bodega y despacho. Debe coincidir con ETAPAS_DE_TALLER en
-- src/lib/stage-report.ts.
DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_etapa_es_de_taller
    CHECK (workflow_step IN (
      'guillotine_first_cut', 'offset_printing', 'digital_printing',
      'die_cutting', 'guillotine_final_cut', 'workshop', 'workshop_revision'
    ));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- La historia de una OT se lee entera y en orden; el análisis de una etapa se
-- lee por etapa a través de todas las OT. Dos accesos, dos índices.
CREATE INDEX IF NOT EXISTS idx_ot_stage_reports_ot
  ON public.ot_stage_reports (ot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ot_stage_reports_etapa
  ON public.ot_stage_reports (workflow_step, created_at DESC);

-- Sólo lectura para quien supervisa. Las escrituras entran exclusivamente por
-- el rol de servicio, que salta RLS; la ausencia de políticas de UPDATE y
-- DELETE es lo que mantiene el registro inmutable — igual que
-- `ot_status_history`. Un cierre corregible a mano deja de ser evidencia.
ALTER TABLE public.ot_stage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_stage_reports_select_taller ON public.ot_stage_reports;
CREATE POLICY ot_stage_reports_select_taller
  ON public.ot_stage_reports
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'technician'::app_role)
  );

COMMENT ON TABLE public.ot_stage_reports IS
  'Cierre de una etapa de taller: horas que tomó, pliegos perdidos y lo que pasó. Una fila por pasada, no por etapa: un avance parcial cierra la misma etapa más de una vez.';
COMMENT ON COLUMN public.ot_stage_reports.workflow_step IS
  'La etapa que termina, no la de destino.';
COMMENT ON COLUMN public.ot_stage_reports.hours IS
  'Horas reales de la pasada. Multiplicadas por la tarifa de la máquina son el costo de tiempo que faltaba en el costeo real.';
COMMENT ON COLUMN public.ot_stage_reports.merma_sheets IS
  'Pliegos entrados que no salieron vendibles. Se juzga contra el tiraje (ver src/lib/merma.ts), nunca como porcentaje suelto.';

COMMIT;

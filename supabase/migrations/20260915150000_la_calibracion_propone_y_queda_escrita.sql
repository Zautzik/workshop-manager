-- La calibración propone, y la propuesta queda escrita
--
-- `CalibracionMotor.tsx` es un instrumento de medición honesto: carga tres
-- trabajos, compara contra el motor, y si algo se sale de ±10% le dice al
-- supervisor «ajusta CALIBRATION en el código». Ese ajuste ocurre — pero
-- desaparece: no queda quién lo decidió, con qué evidencia, ni cuándo el
-- cambio realmente se aplicó al motor. La brecha medida en
-- `cost_variance_snapshots` y la constante que cambia en
-- `src/lib/ot-calculations.ts` viven en mundos que nunca se tocan.
--
-- Esto no vuelve CALIBRATION dinámica. `CALIBRATION` está tejida como
-- constante de módulo dentro de `computeImposition`, `makeReadySheets`,
-- `finishHoursFor` y `computeOTCalculations` — inyectarla en caliente ahí
-- significa tocar el motor de costeo entero sin red de pruebas, y una
-- imposición mal inyectada cotiza mal cada trabajo del taller, no sólo el de
-- calibración. Ese refactor merece su propio esfuerzo, medido y probado, no
-- un apuro dentro de esta sesión.
--
-- Lo que sí se resuelve hoy es la brecha verificada: la decisión de cambiar
-- una constante deja de ser un edit de código sin rastro y pasa a ser una
-- propuesta con nombre, motivo y evidencia — aplicada después, a mano, en una
-- migración de código revisable, pero con el «por qué» ya escrito antes de
-- que eso pase.

BEGIN;

CREATE TABLE IF NOT EXISTS public.estimator_calibration_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  proposed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- [{path: 'MAKEREADY_SHEETS_PER_PASS', current_value: 120, proposed_value: 140}, ...]
  -- `path` es el nombre del campo en CALIBRATION (incluye 'FINISH_RATES.troquelado.setupH').
  changes      JSONB NOT NULL,
  -- Los trabajos o el período medido que justifican el cambio — normalmente
  -- una copia de las filas de la compuerta §6.6 o de cost_variance_snapshots.
  based_on     JSONB,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  applied_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at   TIMESTAMPTZ,
  -- Referencia al commit/PR donde el cambio realmente se hizo en el código —
  -- la propuesta no aplica sola; esto es lo que la conecta con lo que sí pasó.
  applied_note TEXT
);

DO $$ BEGIN
  ALTER TABLE public.estimator_calibration_proposals ADD CONSTRAINT calibracion_status_valido
    CHECK (status IN ('pending', 'applied', 'rejected'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.estimator_calibration_proposals ADD CONSTRAINT calibracion_motivo_obligatorio
    CHECK (btrim(reason) <> '');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.estimator_calibration_proposals ADD CONSTRAINT calibracion_cambios_no_vacios
    CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Aplicada o rechazada exige quién y cuándo — la misma regla que ya rige
-- anular una OC o cerrar una factura con diferencia.
DO $$ BEGIN
  ALTER TABLE public.estimator_calibration_proposals ADD CONSTRAINT calibracion_resuelta_esta_completa
    CHECK (status = 'pending' OR (applied_by IS NOT NULL AND applied_at IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_calibracion_status ON public.estimator_calibration_proposals(status);

ALTER TABLE public.estimator_calibration_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view calibration proposals" ON public.estimator_calibration_proposals;
CREATE POLICY "Authenticated can view calibration proposals"
ON public.estimator_calibration_proposals FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ops roles manage calibration proposals" ON public.estimator_calibration_proposals;
CREATE POLICY "Ops roles manage calibration proposals"
ON public.estimator_calibration_proposals FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
);

COMMENT ON TABLE public.estimator_calibration_proposals IS
  'Propuestas de ajuste a CALIBRATION (src/lib/ot-calculations.ts), con motivo y evidencia, previas a que alguien edite el código. Cierra el registro que faltaba — no vuelve la constante dinámica.';

COMMIT;

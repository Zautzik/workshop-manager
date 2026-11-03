-- El ajuste de prensa se configura, se mide y se corrige
--
-- El ajuste —montar las planchas y entonar el color hasta que el pliego sale
-- vendible— es tiempo de máquina parada que no depende del tiraje: 500 pliegos
-- o 50.000, el ajuste es el mismo. El presupuesto lo modelaba como una
-- constante (`CALIBRATION.MAKEREADY_HOURS_PER_PASS`, 30 min por pasada) igual
-- para todas las prensas, y el Cronograma no lo mostraba aparte.
--
-- No es una constante: depende de la prensa (cuántos cuerpos tiene, en qué
-- estado está) y de quién la ajusta. Por eso son tres datos y no uno:
--
--   machines.ajuste_minutes        Lo que el supervisor dice que toma esa
--                                  prensa hoy. Editable; NULL = usar lo medido.
--   ot_stage_reports.ajuste_minutes Lo que tomó DE VERDAD, declarado al cerrar
--                                  la etapa de offset. Con la asignación de
--                                  `worker_assignments` (máquina + día) dice
--                                  también QUIÉN ajustó: la habilidad del
--                                  operario queda medida, no supuesta.
--   ots.ajuste_minutes             Corrección para UN trabajo ("este pantone
--                                  va a costar"), desde el Cronograma.
--
-- No va en `ot_machine_schedule`: las compuertas de transición cuentan sus
-- filas como prueba de que la OT está programada, y una fila que sólo guarde
-- una corrección de ajuste las abriría sin que nadie haya programado nada.
--
-- Todos en minutos POR PASADA (una prensa de 2 cuerpos ajusta dos veces un 4/0).
--
-- ── Quién lo hizo ───────────────────────────────────────────────────────────
--
-- `ot_stage_reports.operator_employee_id`: el operario que hizo la etapa, cuando
-- se sabe de primera mano. Lo llena el parte de WhatsApp (quien escribe
-- «ajuste 40 min» desde su teléfono es quien ajustó), que además llega casi
-- siempre DESPUÉS del trabajo: es dato retroactivo que afina las estimaciones
-- de las OT siguientes. Sin él, el operario se deduce de `worker_assignments`.

BEGIN;

ALTER TABLE public.machines         ADD COLUMN IF NOT EXISTS ajuste_minutes INTEGER;
ALTER TABLE public.ot_stage_reports ADD COLUMN IF NOT EXISTS ajuste_minutes INTEGER;
ALTER TABLE public.ots              ADD COLUMN IF NOT EXISTS ajuste_minutes INTEGER;

ALTER TABLE public.ot_stage_reports
  ADD COLUMN IF NOT EXISTS operator_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_ajuste_minutes_check;
ALTER TABLE public.machines ADD CONSTRAINT machines_ajuste_minutes_check
  CHECK (ajuste_minutes IS NULL OR (ajuste_minutes >= 0 AND ajuste_minutes <= 600));

ALTER TABLE public.ot_stage_reports DROP CONSTRAINT IF EXISTS ot_stage_reports_ajuste_minutes_check;
ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_ajuste_minutes_check
  CHECK (ajuste_minutes IS NULL OR (ajuste_minutes > 0 AND ajuste_minutes <= 600));

ALTER TABLE public.ots DROP CONSTRAINT IF EXISTS ots_ajuste_minutes_check;
ALTER TABLE public.ots ADD CONSTRAINT ots_ajuste_minutes_check
  CHECK (ajuste_minutes IS NULL OR (ajuste_minutes >= 0 AND ajuste_minutes <= 600));

COMMENT ON COLUMN public.machines.ajuste_minutes IS
  'Minutos de ajuste (planchas + entonar color) por pasada que el supervisor fija para esta prensa. NULL = usar la mediana medida en ot_stage_reports, o el valor del presupuesto.';
COMMENT ON COLUMN public.ot_stage_reports.ajuste_minutes IS
  'Minutos reales de ajuste por pasada declarados al cerrar la etapa de offset. El operario se resuelve con worker_assignments (machine_id + fecha).';
COMMENT ON COLUMN public.ot_stage_reports.operator_employee_id IS
  'Operario que hizo la etapa, de primera mano (el que mandó el parte de WhatsApp). NULL = se deduce de worker_assignments.';
COMMENT ON COLUMN public.ots.ajuste_minutes IS
  'Corrección del ajuste por pasada para este trabajo, fijada desde el Cronograma. Manda sobre la máquina y lo medido.';

COMMIT;

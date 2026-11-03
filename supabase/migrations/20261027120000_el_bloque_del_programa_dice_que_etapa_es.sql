-- El bloque del programa dice qué etapa es
--
-- `ot_machine_schedule` guarda "esta OT, en esta máquina, a esta hora", y la
-- etapa se deducía del tipo de máquina: offset → impresión. Eso alcanza
-- mientras cada máquina haga una sola cosa por OT, y en el taller no es así:
-- la guillotina hace el corte inicial Y el corte final de la misma OT, y el
-- taller manual hace el desglose, las terminaciones, la revisión de etiquetas
-- y el embalaje. Al arrastrar uno de esos bloques en el Cronograma, sin esta
-- columna no hay forma de saber cuál de las etapas quedó fijada.
--
-- Nullable a propósito: las filas existentes (escritas desde la Hoja de
-- Producción) no la tienen, y el planificador las sigue resolviendo con la
-- primera etapa de la ruta que esa máquina puede hacer (`inferPlanStep`,
-- src/lib/production-route.ts). La lista de valores es `PLAN_STEP_KEYS` del
-- mismo archivo; si se agrega una etapa allá, se agrega acá.

BEGIN;

ALTER TABLE public.ot_machine_schedule
  ADD COLUMN IF NOT EXISTS plan_step TEXT;

ALTER TABLE public.ot_machine_schedule
  DROP CONSTRAINT IF EXISTS ot_machine_schedule_plan_step_check;

ALTER TABLE public.ot_machine_schedule
  ADD CONSTRAINT ot_machine_schedule_plan_step_check CHECK (
    plan_step IS NULL OR plan_step IN (
      'corte_inicial', 'offset', 'digital', 'laminado', 'troquelado',
      'corte_final', 'desglose', 'plegado', 'terminaciones', 'tercerizado',
      'revision_etiquetas', 'embalaje', 'despacho'
    )
  );

COMMENT ON COLUMN public.ot_machine_schedule.plan_step IS
  'Etapa del plan de producción que ocupa este bloque (PLAN_STEP_KEYS en src/lib/production-route.ts). NULL en filas antiguas: se infiere del tipo de máquina.';

COMMIT;

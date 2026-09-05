-- Una pauta no sabía qué hacer, y una orden no sabía qué pauta la generó.
--
-- `maintenance_schedules` ya calcula cuándo vence algo -- por calendario, por
-- uso, o lo que ocurra primero (ver evaluateSchedule en maintenance-due.ts) --
-- pero no dice QUÉ hay que hacer: es una fecha con una descripción de texto
-- libre, sin checklist. Y `maintenance_work_orders` no tiene forma de saber
-- si nació de una pauta vencida o es puramente correctiva, así que completar
-- una orden nunca le avisaba a la pauta que ya se hizo: una pauta vencida se
-- queda vencida para siempre, aunque el trabajo se haya hecho la semana pasada.
--
-- Se agrega el enlace en los dos sentidos, y el snapshot de qué se marcó
-- durante la ejecución. Snapshot y no un join en vivo a maintenance_checklists
-- a propósito: si alguien edita una checklist después de que una orden ya la
-- ejecutó, la orden completada no puede empezar a mostrar pasos distintos de
-- los que realmente se hicieron.

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS checklist_id UUID REFERENCES public.maintenance_checklists(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.maintenance_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_items JSONB;

COMMENT ON COLUMN public.maintenance_schedules.checklist_id IS
  'Qué hacer cuando esta pauta vence. Nullable: una pauta puede existir antes de tener checklist, y "Vencimientos" avisa cuando falta.';
COMMENT ON COLUMN public.maintenance_work_orders.schedule_id IS
  'De qué pauta nació esta orden, si nació de una. Null en correctivas. Al completarse una orden con schedule_id, la pauta avanza su reloj (last_maintenance_date/usage) -- es lo que evita que quede vencida para siempre.';
COMMENT ON COLUMN public.maintenance_work_orders.completed_items IS
  'Snapshot de la checklist al momento de ejecutar: qué ítems había, cuáles se marcaron, cuándo y por quién, y las notas de cada uno. No es un join a maintenance_checklists -- es lo que de verdad se hizo, congelado, aunque la checklist se edite después.';

CREATE INDEX IF NOT EXISTS idx_work_orders_schedule ON public.maintenance_work_orders (schedule_id)
  WHERE schedule_id IS NOT NULL;

-- El cron de pautas vencidas (maintenance-due-check) confundía dos preguntas
-- distintas bajo un solo chequeo: "¿ya existe una orden para esta pauta?" y
-- "¿ya se avisó de esta orden?". Una vez creada la orden, cualquier corrida
-- futura la encontraba y saltaba TODO -- incluido reintentar el aviso si el
-- primer intento falló a mitad de camino (un problema real: esta misma
-- sesión sufrió un corte de conectividad a Supabase). El aviso se perdía
-- para siempre, en silencio, sin que nadie se enterara.
--
-- notified_at distingue las dos preguntas: una orden puede existir sin haber
-- sido avisada todavía, y ese estado ahora es reintentable.

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.maintenance_work_orders.notified_at IS
  'Cuándo se avisó (in-app + WhatsApp, ver notifyScheduleDue) que esta orden nació de una pauta vencida. Null = todavía no se pudo avisar -- el cron de mañana lo reintenta, no lo salta.';

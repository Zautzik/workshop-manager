-- Bodega deduplica por wamid, como producción.
--
-- Meta entrega al-menos-una-vez. `whatsapp_warehouse_logs` sólo descartaba un
-- duplicado si llegaba dentro de 60 segundos (mismo ítem, operador y acción):
-- un reintento minutos después creaba un segundo movimiento pendiente, y
-- aprobar los dos movía el stock dos veces.
--
-- La llave es el wamid, con el mismo índice único PARCIAL que producción
-- (20260906120000_wamid_es_la_llave_de_idempotencia): los mensajes sin wamid
-- (simulador, proveedor genérico) siguen entrando sin llave. La escritura la
-- hace `src/lib/warehouse-log.ts`, que atrapa el 23505 y devuelve la fila que
-- ya existía.
--
-- Aditiva: una columna nula y un índice. Las filas existentes quedan con NULL.

ALTER TABLE public.whatsapp_warehouse_logs
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_warehouse_logs_external_message_id
  ON public.whatsapp_warehouse_logs(external_message_id)
  WHERE external_message_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_warehouse_logs.external_message_id IS
  'El wamid de Meta. NULL para mensajes sin uno (simulador, proveedor genérico). Llave de idempotencia: una entrega repetida del mismo mensaje no crea otro movimiento.';

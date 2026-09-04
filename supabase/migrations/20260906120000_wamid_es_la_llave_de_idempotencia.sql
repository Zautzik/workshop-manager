-- El wamid es la llave de idempotencia
--
-- WhatsApp (Meta) garantiza entrega al-menos-una-vez: un blip de red hace que
-- el mismo webhook llegue dos o tres veces. Meta manda un id único por
-- mensaje (wamid) desde el primer día -- el schema de intake ya lo leía
-- (MetaMessageSchema.id) -- pero `extractMetaInbound` nunca lo copiaba al
-- mensaje normalizado, así que se perdía antes de llegar a processMessage.
--
-- Lo único que existía en su lugar era una ventana de 60 segundos, SELECT
-- y después INSERT, sólo para mensajes 'end':
--
--   1. No cubre 'start' ni 'cancel' -- cero deduplicación ahí.
--   2. 60 segundos es una apuesta, no una garantía: un reintento de Meta
--      después de un corte real de red no tiene por qué caer adentro.
--   3. SELECT-y-después-INSERT es la misma carrera que ya se cerró en
--      consumir_lote (bloquear_la_fila_y_reemplazar_sin_perder.sql): dos
--      entregas casi simultáneas del mismo wamid pueden pasar las dos el
--      SELECT antes de que ninguna haya insertado.
--
-- La fila de un 'end' duplicado no es basura inofensiva: si un supervisor
-- aprueba las dos (indistinguibles en una cola de revisión ocupada),
-- feed_whatsapp_to_real_costs() las alimenta dos veces -- el mismo trabajo
-- contado el doble en ot_real_costs, que es el número del que depende el
-- margen.
--
-- La corrección no es ajustar la ventana: es guardar el wamid y dejar que
-- Postgres, no una consulta previa, decida si ya existe. NULL para los
-- mensajes que no tienen uno (el simulador, el proveedor genérico) -- por
-- eso el índice único es parcial.

ALTER TABLE public.whatsapp_production_logs
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_logs_external_message_id
  ON public.whatsapp_production_logs(external_message_id)
  WHERE external_message_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_production_logs.external_message_id IS
  'El wamid de Meta (o el id del proveedor genérico). NULL para mensajes sin uno -- el
   simulador interno, sobre todo. Es la llave real de idempotencia: un INSERT con
   ON CONFLICT (external_message_id) DO NOTHING reemplaza la ventana de 60 segundos que
   sólo cubría "end" y que dejaba una carrera SELECT-antes-de-INSERT abierta.';

-- ─── Insertar sin poder duplicar ─────────────────────────────────────────────
--
-- El índice de arriba es PARCIAL (`WHERE external_message_id IS NOT NULL`), así
-- que un `ON CONFLICT (external_message_id)` armado por PostgREST/supabase-js
-- no calza con él -- Postgres exige que el target de ON CONFLICT repita el
-- mismo predicado del índice parcial para poder inferirlo. Se resuelve una
-- vez, acá, con la misma disciplina que ya usa consumir_lote: la función es la
-- única puerta de escritura, y ATRAPA la violación de unicidad en vez de
-- adivinarla con un SELECT previo -- eso es lo que la hace atómica de verdad
-- bajo dos entregas casi simultáneas del mismo wamid.
CREATE OR REPLACE FUNCTION public.insert_whatsapp_log_idempotent(
  p_external_message_id   TEXT,
  p_ot_number             TEXT,
  p_ot_id                 UUID,
  p_operator_phone        TEXT,
  p_operator_name         TEXT,
  p_operator_employee_id  UUID,
  p_message_type          public.whatsapp_message_type,
  p_raw_message           TEXT,
  p_message_timestamp     TIMESTAMPTZ,
  p_review_status         public.whatsapp_review_status,
  p_parsed_data           JSONB DEFAULT NULL,
  p_inferred_costs        JSONB DEFAULT NULL,
  p_start_log_id          UUID DEFAULT NULL,
  p_elapsed_minutes       NUMERIC DEFAULT NULL
)
RETURNS TABLE (id UUID, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_production_logs (
    external_message_id, ot_number, ot_id, operator_phone, operator_name,
    operator_employee_id, message_type, raw_message, message_timestamp,
    parsed_data, inferred_costs, start_log_id, elapsed_minutes, review_status
  ) VALUES (
    p_external_message_id, p_ot_number, p_ot_id, p_operator_phone, p_operator_name,
    p_operator_employee_id, p_message_type, p_raw_message, p_message_timestamp,
    p_parsed_data, p_inferred_costs, p_start_log_id, p_elapsed_minutes, p_review_status
  )
  RETURNING public.whatsapp_production_logs.id INTO v_id;

  RETURN QUERY SELECT v_id, true;
EXCEPTION WHEN unique_violation THEN
  -- Otro request (u otra entrega del mismo wamid) ganó la carrera. No es un
  -- error -- es exactamente el caso que esta función existe para manejar --
  -- así que se devuelve la fila que ya existe, no una excepción.
  RETURN QUERY
    SELECT wl.id, false
    FROM public.whatsapp_production_logs wl
    WHERE wl.external_message_id = p_external_message_id;
END;
$$;

COMMENT ON FUNCTION public.insert_whatsapp_log_idempotent IS
  'Único camino de escritura para whatsapp_production_logs (start/end). Atrapa la
   violación de unicidad de external_message_id -- que la deduplicación sea correcta
   bajo entregas concurrentes depende de que sea EXCEPTION, no un SELECT previo.';

GRANT EXECUTE ON FUNCTION public.insert_whatsapp_log_idempotent(
  TEXT, TEXT, UUID, TEXT, TEXT, UUID, public.whatsapp_message_type, TEXT, TIMESTAMPTZ,
  public.whatsapp_review_status, JSONB, JSONB, UUID, NUMERIC
) TO authenticated, service_role;

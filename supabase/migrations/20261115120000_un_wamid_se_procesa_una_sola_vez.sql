-- Un wamid se procesa una sola vez
--
-- ── Lo que había ────────────────────────────────────────────────────────────
--
-- La idempotencia por wamid (20260906120000) vive en UNA tabla:
-- `whatsapp_production_logs`. Protege los partes de producción (start/end) y
-- nada más. Todo lo otro que un mensaje puede provocar corre antes o al lado de
-- ese INSERT y no la ve:
--
--   1. Las respuestas de mantención (whatsapp-maintenance-ingest.ts) cierran la
--      orden y registran el downtime sin tocar esa tabla. Si la primera entrega
--      se demora más que el timeout de Meta, la segunda vuelve a correr entera.
--   2. `cancel` tampoco inserta nada: cada reentrega vuelve a buscar un inicio
--      activo y lo rechaza.
--   3. La foto adjunta se descarga y se registra de nuevo en cada entrega.
--
-- ── Lo que queda ────────────────────────────────────────────────────────────
--
-- Un candado ANTES de procesar, no un chequeo después: el webhook inserta el
-- wamid acá y sólo sigue si la fila es suya. La llave primaria decide —no un
-- SELECT previo—, así que dos entregas simultáneas del mismo wamid no pueden
-- pasar las dos (la misma disciplina de `insert_whatsapp_log_idempotent`).
--
-- `channel` separa los webhooks (producción, y bodega cuando lo adopte): son
-- endpoints distintos y no tienen por qué pisarse.
--
-- El candado se SUELTA (DELETE) cuando el procesamiento falla de una forma que
-- el remitente va a reintentar, para que ese reintento no se trague un mensaje
-- que nunca se procesó. Ver src/lib/whatsapp-claim.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_claims (
  channel     TEXT NOT NULL CHECK (length(btrim(channel)) > 0),
  wamid       TEXT NOT NULL CHECK (length(btrim(wamid)) > 0),
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, wamid)
);

COMMENT ON TABLE public.whatsapp_inbound_claims IS
  'Candado de idempotencia del webhook de WhatsApp: una fila por mensaje (wamid) ya tomado. El webhook inserta antes de procesar; si la llave ya existe, es una reentrega y se responde 200 sin procesar. Regla en src/lib/whatsapp-claim.ts.';

-- Para podar filas viejas: Meta reintenta hasta 7 días, después la fila ya no
-- protege nada.
CREATE INDEX IF NOT EXISTS whatsapp_inbound_claims_claimed_at
  ON public.whatsapp_inbound_claims (claimed_at);

-- Sólo el webhook escribe, con service_role (que salta RLS); sin políticas a
-- propósito, y sin permisos para los roles del navegador.
ALTER TABLE public.whatsapp_inbound_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_inbound_claims FROM anon, authenticated;

COMMIT;

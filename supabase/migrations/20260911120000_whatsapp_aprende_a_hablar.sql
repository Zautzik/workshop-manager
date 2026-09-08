-- Hasta hoy la integración de WhatsApp era de una sola vía: el taller
-- escribe, el sistema procesa. whatsapp-ingest.ts/whatsapp-media.ts sólo
-- llaman al endpoint de DESCARGA de la Graph API (una foto que ya llegó),
-- nunca al de envío. Sin esta bitácora no hay forma de verificar en
-- desarrollo/simulador qué mensaje se habría mandado, ni de auditar en
-- producción qué se mandó de verdad y si Meta lo aceptó.
--
-- No reemplaza domain_events: esa bitácora es específicamente de OTs
-- (ot_id con FK real a public.ots) y una pauta de mantención vencida no es
-- una OT. Ver src/lib/maintenance-notify.ts.
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone    TEXT NOT NULL,
  body        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  error       TEXT,
  context     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_log_created ON public.whatsapp_outbound_log(created_at DESC);

COMMENT ON TABLE public.whatsapp_outbound_log IS
  'Registro de cada intento de envío saliente de WhatsApp (ver sendWhatsAppMessage en src/lib/whatsapp-send.ts). provider distingue meta (Graph API real) de generic (modo dev/simulador, no se manda nada de verdad).';

ALTER TABLE public.whatsapp_outbound_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_outbound_log_select_management ON public.whatsapp_outbound_log;
CREATE POLICY whatsapp_outbound_log_select_management ON public.whatsapp_outbound_log
  FOR SELECT TO authenticated USING (true);

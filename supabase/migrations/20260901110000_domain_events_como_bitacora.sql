-- Un solo lugar donde queda registrado "esto pasó", en vez de cuatro rutas que
-- deciden cada una por su cuenta a quién avisar.
--
-- `ot_status_history` ya registraba el CAMBIO de estado, pero sólo eso, y sólo
-- en `/transition`. Partir una OT (`/split`), recibirla aprobada desde el
-- portal (`/track/[token]/approval`) y el cierre masivo (`/bulk-transition`)
-- cambian `ots.status` cada uno con su propio código, y de las cuatro rutas
-- sólo `/transition` avisaba a supervisión cuando una OT llegaba a un hito
-- (lista para despacho, completada). Una OT que llega a "completada" por un
-- split silencioso no avisaba a nadie -- no por decisión, por omisión: nadie
-- había copiado ese bloque a la ruta nueva.
--
-- `domain_events` es la bitácora única. Quien cambia una OT emite un evento
-- acá; quien necesita reaccionar (hoy, las notificaciones a supervisión; más
-- adelante, lo que sea) lee de acá en vez de que el emisor tenga que saber de
-- cada consumidor. Ver src/lib/domain-events.ts.
CREATE TABLE IF NOT EXISTS public.domain_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  ot_id       UUID REFERENCES public.ots(id) ON DELETE SET NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_ot_id ON public.domain_events(ot_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_type_created ON public.domain_events(event_type, created_at DESC);

COMMENT ON TABLE public.domain_events IS
  'Bitácora de eventos de dominio. Best-effort: quien emite (ver emitDomainEvent()) no
   deshace su operación si esto falla -- la fuente de verdad del estado de una OT sigue
   siendo ots.status / ot_status_history, esto es el rastro para quien necesite reaccionar.';

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_events_select_management ON public.domain_events;
CREATE POLICY domain_events_select_management ON public.domain_events
  FOR SELECT TO authenticated USING (true);

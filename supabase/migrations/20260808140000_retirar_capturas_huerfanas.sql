-- Retirar las capturas que citan órdenes que ya no existen.
--
-- Los partes de WhatsApp guardan el número de OT que el operario escribió. Los
-- 17 números que aparecen —40488, 40492, 40494, 40497, 40498, 40499, 40500,
-- 45500, 38850, 38885 y la serie OT-2025/2026-0xx— son todos de las órdenes
-- sembradas que se retiraron antes en esta misma auditoría. Ninguno resuelve a
-- una OT viva, y no van a resolver nunca: la orden a la que apuntan se borró.
--
-- No es un enlace roto en el código. La ingesta SÍ resuelve ot_number → ot_id
-- (`whatsapp-ingest.ts`), así que las capturas nuevas enganchan solas. Éstas son
-- huérfanas de un padre que ya no está.
--
-- Mientras sigan ahí contaminan todo lo que se mida sobre capturas: la merma
-- total salía 11,4% arrastrada por un trabajo de una OT inexistente, y el panel
-- de Capturas muestra 156 pendientes de revisar que nadie puede resolver porque
-- no hay a qué OT cargarlas.
--
-- Se conservan las 3 que sí tienen `ot_id`: son de la 40502, que existe.

BEGIN;

-- ── Red de seguridad ────────────────────────────────────────────────────────
-- Si el conjunto no es el esperado, se aborta entero en vez de borrar «lo que
-- haya». Y nunca se toca una captura enlazada a una OT viva.

DO $$
DECLARE
  vivas integer;
  huerfanas integer;
BEGIN
  SELECT count(*) INTO vivas
    FROM public.capture_events c
   WHERE c.ot_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ots o WHERE o.id = c.ot_id);

  SELECT count(*) INTO huerfanas
    FROM public.capture_events c
   WHERE c.ot_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.ots o WHERE o.id = c.ot_id);

  RAISE NOTICE 'capturas enlazadas a OT viva: % · huérfanas a retirar: %', vivas, huerfanas;

  IF vivas = 0 THEN
    RAISE EXCEPTION 'No queda ninguna captura enlazada a una OT viva. Se aborta: eso significaría borrarlo todo.';
  END IF;
  IF huerfanas > 200 THEN
    RAISE EXCEPTION 'Se retirarían % capturas, más de las esperadas. Se aborta.', huerfanas;
  END IF;
END $$;

-- ── Los partes de producción de WhatsApp ────────────────────────────────────
-- Misma condición y mismo motivo. `whatsapp_pending_reviews` es una vista sobre
-- estos registros, así que la cola de revisión se vacía sola.

DELETE FROM public.whatsapp_production_logs w
 WHERE w.ot_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.ots o WHERE o.id = w.ot_id);

-- ── La bandeja unificada de capturas ────────────────────────────────────────

DELETE FROM public.capture_events c
 WHERE c.ot_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.ots o WHERE o.id = c.ot_id);

-- ── Comprobación ────────────────────────────────────────────────────────────

DO $$
DECLARE restantes integer; sin_ot integer;
BEGIN
  SELECT count(*) INTO restantes FROM public.capture_events;
  SELECT count(*) INTO sin_ot FROM public.capture_events WHERE ot_id IS NULL;
  RAISE NOTICE 'capturas restantes: % · sin ot_id: %', restantes, sin_ot;

  IF sin_ot > 0 THEN
    RAISE EXCEPTION 'Quedaron % capturas sin OT. Se aborta.', sin_ot;
  END IF;
END $$;

COMMIT;

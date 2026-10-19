-- Mover la fecha de la próxima mantención necesita visto bueno del supervisor
--
-- Cerrar una orden llama a `advanceLinkedSchedule`, que corre el reloj de la
-- pauta: la próxima mantención de esa máquina se va para adelante. Es correcto
-- cuando lo cierra alguien con sesión — hay una persona identificada detrás.
--
-- Desde la etiqueta Qué (`/m/<token>`) no hay nadie identificado: lo que abre la
-- puerta es el token impreso en la máquina. Quien le saque una foto podría
-- cerrar una orden y, con eso, **estirar el intervalo de mantención de un
-- equipo**, sin que el registro diga quién fue. Eso no es una molestia
-- administrativa: es la clase de cambio que se nota recién cuando una máquina
-- falla antes de lo previsto.
--
-- Decisión del dueño (2026-10-19): no hace falta credencial del operario, pero
-- **ninguna fecha de mantención se mueve sin que un supervisor lo apruebe**.
--
-- ── Cómo queda ─────────────────────────────────────────────────────────────
--
-- El cierre desde la etiqueta SÍ se registra en el momento: la orden queda
-- completada, con sus ítems marcados y su hora. Perder el reporte del operario
-- que acaba de hacer el trabajo sería el peor de los dos errores.
--
-- Lo que queda en suspenso es sólo el avance de la pauta. La orden se marca con
-- `avance_pendiente`, la pauta sigue mostrándose vencida —que es la verdad
-- mientras nadie del taller lo haya revisado— y un supervisor lo aprueba desde
-- Órdenes. Ahí, y sólo ahí, se mueve la fecha.
--
-- `cerrada_desde` deja por escrito de dónde vino el cierre. Importa justamente
-- porque en el camino de la etiqueta no hay persona: el supervisor que aprueba
-- tiene que poder ver que esto lo cerró una etiqueta y no un colega.
--
-- Un cierre con sesión no cambia: `avance_pendiente` queda en false y la fecha
-- se mueve como siempre.

BEGIN;

ALTER TABLE public.maintenance_work_orders
  -- La orden se cerró pero la pauta NO se avanzó todavía.
  ADD COLUMN IF NOT EXISTS avance_pendiente   BOOLEAN NOT NULL DEFAULT false,
  -- Quién autorizó mover la fecha, y cuándo.
  ADD COLUMN IF NOT EXISTS avance_aprobado_por UUID,
  ADD COLUMN IF NOT EXISTS avance_aprobado_en  TIMESTAMPTZ,
  -- 'sesion' | 'etiqueta'. De dónde vino el cierre.
  ADD COLUMN IF NOT EXISTS cerrada_desde      TEXT;

DO $$ BEGIN
  ALTER TABLE public.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_cerrada_desde_valida
    CHECK (cerrada_desde IS NULL OR cerrada_desde IN ('sesion', 'etiqueta'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Una aprobación sin responsable ni reloj es una afirmación, no un registro —
-- el mismo criterio que `ot_approvals_decidida_tiene_quien_y_cuando`.
DO $$ BEGIN
  ALTER TABLE public.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_avance_aprobado_completo
    CHECK (
      (avance_aprobado_por IS NULL AND avance_aprobado_en IS NULL)
      OR (avance_aprobado_por IS NOT NULL AND avance_aprobado_en IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- La cola del supervisor: las que esperan visto bueno. Índice parcial porque
-- son pocas y se consultan seguido.
CREATE INDEX IF NOT EXISTS maintenance_work_orders_avance_pendiente_idx
  ON public.maintenance_work_orders (machine_id)
  WHERE avance_pendiente;

COMMENT ON COLUMN public.maintenance_work_orders.avance_pendiente IS
  'La orden se cerro pero la pauta NO se avanzo. Lo pone el cierre desde la etiqueta QR, donde no hay persona identificada. Un supervisor lo aprueba y ahi se mueve la fecha.';
COMMENT ON COLUMN public.maintenance_work_orders.cerrada_desde IS
  'De donde vino el cierre: sesion (persona identificada) o etiqueta (QR de la maquina, sin sesion).';

COMMIT;

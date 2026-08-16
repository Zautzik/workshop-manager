-- No todo lo que la OT necesita se compra
--
-- La etapa se llamaba «Compra de Papel» y el sistema la modelaba literalmente:
-- una OC, un papel, una recepción. Pero cuando una orden aterriza en el taller
-- necesita varias cosas a la vez y por caminos distintos:
--
--   · papel que hay que comprar
--   · papel QUE YA ESTÁ EN BODEGA de un trabajo anterior y nunca se usó
--   · un pantone especial que se pide aparte y llega en su propio tarro
--   · cajas para despachar
--   · polilaminado, que no es material sino un SERVICIO de un tercero
--
-- Las tres formas de resolver son distintas y el modelo anterior sólo conocía
-- una. Lo de bodega no lleva OC ni recepción —ya está ahí—, y forzarlo a
-- pasar por una compra es lo que hace que el taller termine registrando una OC
-- falsa o, peor, no registrando nada.
--
-- El nombre de la etapa en la base sigue siendo `paper_purchase`. Renombrar un
-- valor de enum en producción tiene costo real —índices, historial, funciones
-- que lo citan— y ningún beneficio visible: lo que la gente lee es la etiqueta,
-- y esa sí cambia.

BEGIN;

CREATE TABLE IF NOT EXISTS ot_requirements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id       UUID NOT NULL REFERENCES ots(id) ON DELETE CASCADE,

  -- Qué clase de cosa. No es el material: es para qué sirve, que es lo que
  -- decide quién lo consigue y por qué camino.
  kind        TEXT NOT NULL,

  -- Dicho como lo diría el jefe de taller: «Pantone 485 C», «Cartulina 300g
  -- para tapa», «Polilaminado brillante una cara». El texto libre es a
  -- propósito: obligar a elegir de un catálogo frena el registro de lo que
  -- todavía no está catalogado, que es justamente lo especial.
  description TEXT NOT NULL,

  -- Si además corresponde a algo del catálogo, se ata. Opcional.
  item_id     UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  quantity    NUMERIC(14,2),
  unit        TEXT,

  -- ── Cómo se resuelve ──────────────────────────────────────────────────────
  --
  -- `bodega` es la que faltaba y la que más se usa: el papel ya está y no hay
  -- nada que comprar.
  source      TEXT NOT NULL DEFAULT 'comprar',

  -- El camino elegido deja su rastro en una de estas dos, nunca en las dos.
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  lot_id      UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,

  status      TEXT NOT NULL DEFAULT 'pendiente',
  notes       TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_kind_valido
    CHECK (kind IN ('papel', 'tinta_especial', 'envase', 'servicio', 'insumo', 'otro'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_source_valido
    CHECK (source IN ('comprar', 'bodega', 'tercerizar'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_status_valido
    CHECK (status IN ('pendiente', 'en_curso', 'resuelto', 'no_aplica'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Un requisito resuelto tiene que decir CÓMO. Sin esto «resuelto» es una
-- casilla que alguien marcó, y la etapa entera vuelve a ser un trámite.
DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_resuelto_tiene_rastro
    CHECK (
      status <> 'resuelto'
      OR source = 'tercerizar'
      OR purchase_id IS NOT NULL
      OR lot_id IS NOT NULL
    );
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- De bodega no se compra, y lo comprado todavía no tiene lote. Cruzarlos es
-- el error que deja un requisito contado dos veces.
DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_un_solo_camino
    CHECK (purchase_id IS NULL OR lot_id IS NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ot_requirements_ot ON ot_requirements (ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_requirements_pendientes
  ON ot_requirements (ot_id) WHERE status IN ('pendiente', 'en_curso');

COMMENT ON TABLE ot_requirements IS
  'Todo lo que una OT necesita para producirse, con el camino por el que se consigue. Lo de bodega no lleva OC: ya está.';
COMMENT ON COLUMN ot_requirements.source IS
  'comprar (OC a proveedor) · bodega (stock existente, sin compra) · tercerizar (servicio de un tercero).';

-- ─── El estado de la etapa, por OT ──────────────────────────────────────────
--
-- La etapa no avanza porque llegó «el papel»: avanza cuando NO QUEDA NADA
-- pendiente. Con una sola OC eso era lo mismo; con cinco requisitos por
-- caminos distintos, deja de serlo.
CREATE OR REPLACE VIEW public.ot_compras_estado AS
SELECT
  o.id                                             AS ot_id,
  o.ot_number,
  o.status,
  COUNT(r.id)                                      AS requisitos,
  COUNT(r.id) FILTER (WHERE r.status = 'resuelto') AS resueltos,
  COUNT(r.id) FILTER (WHERE r.status IN ('pendiente', 'en_curso')) AS pendientes,
  COUNT(r.id) FILTER (WHERE r.source = 'comprar'    AND r.status <> 'resuelto') AS por_comprar,
  COUNT(r.id) FILTER (WHERE r.source = 'bodega'     AND r.status <> 'resuelto') AS por_sacar,
  COUNT(r.id) FILTER (WHERE r.source = 'tercerizar' AND r.status <> 'resuelto') AS por_tercerizar,
  -- Sin requisitos cargados no se puede afirmar que esté listo: es «no se
  -- sabe», y decirlo es más útil que un falso verde.
  CASE
    WHEN COUNT(r.id) = 0 THEN 'sin_cargar'
    WHEN COUNT(r.id) FILTER (WHERE r.status IN ('pendiente', 'en_curso')) = 0 THEN 'completo'
    ELSE 'pendiente'
  END                                              AS estado
FROM public.ots o
LEFT JOIN public.ot_requirements r ON r.ot_id = o.id AND r.status <> 'no_aplica'
GROUP BY o.id, o.ot_number, o.status;

COMMENT ON VIEW public.ot_compras_estado IS
  'Cuánto le falta a una OT para poder producirse, contando los tres caminos. La etapa avanza cuando no queda nada pendiente.';

COMMIT;

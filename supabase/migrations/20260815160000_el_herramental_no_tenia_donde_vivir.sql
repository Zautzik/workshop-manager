-- El herramental no tenía dónde vivir
--
-- `ots` tiene diez banderas `finish_*` que dicen QUÉ terminaciones lleva el
-- trabajo, y ni una sola columna que diga CON QUÉ se hacen. Un trabajo podía
-- estar marcado `finish_troquelado = true` y no había forma de anotar si el
-- troquel es nuevo o ya existe, ni cuál es.
--
-- La consecuencia se veía en Pre-Prensa: la ficha nunca pedía el troquel,
-- porque no había dónde ponerlo. Un trabajo troquelado llegaba a la prueba sin
-- que nadie hubiera confirmado que la herramienta existe — y un troquel nuevo
-- son ~$320.000 y dos semanas de espera, que es exactamente el dato que hunde
-- una fecha de entrega cuando aparece tarde.
--
-- Son cinco columnas porque son cinco terminaciones que necesitan una
-- herramienta física antes de poder imprimir: troquelado, hot stamping,
-- relieve, laminado y pegado. El resto (barniz, numeración, perforado) se hace
-- con lo que ya está montado.

BEGIN;

ALTER TABLE ots
  -- Nuevo o existente. Es la pregunta cara: un troquel nuevo agrega costo y
  -- semanas; uno existente sólo hay que encontrarlo en la estantería.
  ADD COLUMN IF NOT EXISTS die_source          TEXT,
  -- Cuál, físicamente. «El del año pasado» no lo encuentra nadie.
  ADD COLUMN IF NOT EXISTS die_code            TEXT,
  ADD COLUMN IF NOT EXISTS cliche_code         TEXT,
  ADD COLUMN IF NOT EXISTS relieve_matrix_code TEXT,
  -- Brillante, mate o soft touch: cambian de precio y de proveedor.
  ADD COLUMN IF NOT EXISTS lamination_type     TEXT;

DO $$ BEGIN
  ALTER TABLE ots ADD CONSTRAINT ots_die_source_valido
    CHECK (die_source IS NULL OR die_source IN ('nuevo', 'existente'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ots ADD CONSTRAINT ots_lamination_type_valido
    CHECK (lamination_type IS NULL OR lamination_type IN ('brillante', 'mate', 'soft_touch'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

COMMENT ON COLUMN ots.die_source IS
  'Troquel nuevo o existente. Nuevo = ~$320.000 y dos semanas: hay que saberlo en Pre-Prensa, no en Compra de Papel.';
COMMENT ON COLUMN ots.die_code IS
  'Identificación física del troquel en la estantería. Sin esto, «el del año pasado» no lo encuentra nadie.';

COMMIT;

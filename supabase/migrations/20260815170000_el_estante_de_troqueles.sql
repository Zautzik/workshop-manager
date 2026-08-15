-- El estante de troqueles
--
-- Un troquel es una herramienta física que vive en una estantería del taller,
-- cuesta del orden de $320.000, tarda dos semanas en llegar, y se puede usar
-- muchas veces. Hasta ahora la aplicación no sabía que existían: cada trabajo
-- troquelado se cotizaba como si hubiera que mandar a hacer uno nuevo.
--
-- El costo de no tener esto no es de registro, es de plata: nadie puede
-- contestar «¿tenemos uno que sirva?» sin caminar hasta el estante y revisar a
-- ojo, así que en la práctica no se pregunta y se compra de nuevo.
--
-- Un troquel se AMORTIZA: el primer trabajo lo paga entero y los siguientes lo
-- usan gratis. Por eso `times_used` no es una estadística — es el denominador.

BEGIN;

CREATE TABLE IF NOT EXISTS dies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cómo se lo llama en el taller. Es lo que está escrito en la madera.
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  product_type  TEXT,
  -- La medida de la pieza que corta. Es por lo que se busca cuando entra un
  -- trabajo nuevo: «¿tenemos uno de 9×12?».
  width_cm      NUMERIC(8,2),
  height_cm     NUMERIC(8,2),
  -- Cuántas piezas corta por golpe. Un troquel de 4 poses no sirve para un
  -- trabajo montado a 6.
  cavities      INTEGER NOT NULL DEFAULT 1,
  -- Dónde está, físicamente. Sin esto el registro no ahorra la caminata.
  shelf_location TEXT,
  -- Para quién se hizo. Muchos son exclusivos y no se pueden reusar con otro.
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  exclusive     BOOLEAN NOT NULL DEFAULT false,
  acquisition_cost NUMERIC(14,2),
  acquired_on   DATE,
  -- activo | desgastado | dado_de_baja. Un troquel gastado corta mal y hay que
  -- saberlo ANTES de prometer la fecha, no cuando la pieza sale con rebaba.
  status        TEXT NOT NULL DEFAULT 'activo',
  times_used    INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE dies ADD CONSTRAINT dies_status_valido
    CHECK (status IN ('activo', 'desgastado', 'dado_de_baja'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_dies_medida ON dies (width_cm, height_cm) WHERE status = 'activo';
CREATE INDEX IF NOT EXISTS idx_dies_cliente ON dies (client_id);

-- Qué troquel usa la OT. Es la otra mitad: sin esto el estante existe pero
-- nadie sabe qué trabajo se hizo con qué herramienta.
ALTER TABLE ots ADD COLUMN IF NOT EXISTS die_id UUID REFERENCES dies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ots_die ON ots (die_id) WHERE die_id IS NOT NULL;

-- Usar un troquel lo marca. Contarlo a mano es no contarlo.
CREATE OR REPLACE FUNCTION marcar_uso_de_troquel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.die_id IS NOT NULL AND NEW.die_id IS DISTINCT FROM OLD.die_id THEN
    UPDATE dies
       SET times_used   = times_used + 1,
           last_used_at = now(),
           updated_at   = now()
     WHERE id = NEW.die_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_uso_de_troquel ON ots;
CREATE TRIGGER trg_marcar_uso_de_troquel
  AFTER UPDATE OF die_id ON ots
  FOR EACH ROW EXECUTE FUNCTION marcar_uso_de_troquel();

COMMENT ON TABLE dies IS
  'El estante de troqueles. Herramienta física, cara y reutilizable: el primer trabajo la paga y los siguientes la usan gratis.';
COMMENT ON COLUMN dies.times_used IS
  'Cuántos trabajos la usaron. No es estadística: es el denominador con el que se amortiza.';

COMMIT;

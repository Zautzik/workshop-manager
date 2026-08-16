-- El herramental es un requisito
--
-- El estante de troqueles y la lista de «qué necesita esta OT» se construyeron
-- el mismo día y no se conocían: una OT con troquelado y troquel nuevo tiene
-- ~$320.000 y dos semanas de plazo que la etapa encargada de conseguir cosas no
-- sabía que existían.
--
-- Agregarlo del lado de la aplicación no alcanzaba: el `CHECK` de `kind` no
-- conocía el valor y todo insert con un troquel habría fallado. Una regla que
-- vive en dos lados hay que moverla en los dos.

BEGIN;

ALTER TABLE ot_requirements DROP CONSTRAINT IF EXISTS ot_requirements_kind_valido;

DO $$ BEGIN
  ALTER TABLE ot_requirements ADD CONSTRAINT ot_requirements_kind_valido
    CHECK (kind IN ('papel', 'tinta_especial', 'envase', 'servicio', 'insumo', 'herramental', 'otro'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

COMMENT ON COLUMN ot_requirements.kind IS
  'Para qué sirve la cosa, no qué es: decide quién la consigue y por qué camino. `herramental` son troqueles, clichés y matrices — lo que más plazo agrega.';

COMMIT;

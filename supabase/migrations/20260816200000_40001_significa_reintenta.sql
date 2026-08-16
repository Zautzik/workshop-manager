-- 40001 significa «reintentá», no «no lo hagas»
--
-- `reemplazar_requisitos` lanzaba la edición simultánea con
-- `ERRCODE = '40001'`, que en Postgres es `serialization_failure`: un error
-- TRANSITORIO que los clientes están hechos para reintentar solos.
--
-- PostgREST hacía exactamente eso — reintentar, volver a fallar, reintentar —
-- hasta agotar el tiempo de la petición. El resultado era correcto (no se pisaba
-- nada) pero el usuario veía «upstream request timeout» después de esperar,
-- en vez de «alguien más guardó, recargá» al instante.
--
-- Es un error de detalle con consecuencia grande: elegir un código de la clase
-- equivocada convierte un rechazo instantáneo y explicable en una espera sin
-- explicación. El default de RAISE —P0001, `raise_exception`— es definitivo y
-- no se reintenta, que es exactamente lo que esto significa.

BEGIN;

CREATE OR REPLACE FUNCTION public.reemplazar_requisitos(
  p_ot_id    UUID,
  p_filas    JSONB,
  p_by       UUID DEFAULT NULL,
  p_visto_en TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_actual TIMESTAMPTZ;
  v_n      INTEGER;
BEGIN
  PERFORM 1 FROM ot_requirements WHERE ot_id = p_ot_id FOR UPDATE;

  SELECT max(updated_at) INTO v_actual FROM ot_requirements WHERE ot_id = p_ot_id;

  IF p_visto_en IS NOT NULL AND v_actual IS NOT NULL AND v_actual > p_visto_en THEN
    -- Sin ERRCODE: el default P0001 es definitivo. Con 40001 el cliente lo
    -- tomaba por transitorio y reintentaba hasta el timeout.
    RAISE EXCEPTION
      'Alguien más guardó esta lista mientras la editabas. Recargá para no pisarle el trabajo.';
  END IF;

  DELETE FROM ot_requirements WHERE ot_id = p_ot_id;

  INSERT INTO ot_requirements (
    ot_id, kind, description, item_id, quantity, unit,
    source, purchase_id, lot_id, status, notes, resolved_at, resolved_by
  )
  SELECT
    p_ot_id,
    f->>'kind',
    f->>'description',
    NULLIF(f->>'item_id', '')::UUID,
    NULLIF(f->>'quantity', '')::NUMERIC,
    NULLIF(f->>'unit', ''),
    f->>'source',
    CASE WHEN f->>'source' = 'comprar' THEN NULLIF(f->>'purchase_id', '')::UUID END,
    CASE WHEN f->>'source' = 'bodega'  THEN NULLIF(f->>'lot_id', '')::UUID END,
    COALESCE(f->>'status', 'pendiente'),
    NULLIF(f->>'notes', ''),
    CASE WHEN f->>'status' = 'resuelto' THEN now() END,
    CASE WHEN f->>'status' = 'resuelto' THEN p_by END
  FROM jsonb_array_elements(p_filas) AS f;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('guardados', v_n);
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.reemplazar_requisitos(UUID, JSONB, UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;

-- La desviación autorizada es un dato, no una frase
--
-- Dos defectos de la migración anterior, encontrados probándola:
--
-- 1. `ot_certificacion` tenía tres veredictos y el del medio era INALCANZABLE.
--    Un lote consumido con el certificado vencido caía siempre en
--    `no_conforme`, hubiera o no autorización — así que
--    `con_desviacion_autorizada` no podía ocurrir nunca para el único caso que
--    lo justifica. Un estado que no se puede alcanzar es peor que no tenerlo:
--    hace creer que se distingue algo que no se distingue.
--
--    Y la distinción es justamente lo que mira una auditoría. «Entró material
--    vencido y nadie se enteró» y «entró con autorización firmada de Calidad»
--    son hallazgos de gravedad muy distinta.
--
-- 2. La autorización del consumo se guardaba DENTRO del texto de las notas.
--    Un dato que hay que reconstruir con una búsqueda de texto no es un dato:
--    se rompe con una tilde, no se puede indexar, y nadie lo puede consultar
--    sin conocer la frase exacta que alguien eligió una tarde.

BEGIN;

ALTER TABLE inventory_stock_transactions
  ADD COLUMN IF NOT EXISTS authorized_deviation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deviation_reason     TEXT;

COMMENT ON COLUMN inventory_stock_transactions.authorized_deviation IS
  'Este consumo entró con autorización escrita pese a no cumplir el requisito de certificación.';

-- Lo ya registrado por la versión anterior se recupera del texto UNA vez y
-- nunca más. La migración es el único lugar donde esa búsqueda es aceptable.
UPDATE inventory_stock_transactions
   SET authorized_deviation = true,
       deviation_reason = split_part(notes, 'DESVIACIÓN AUTORIZADA: ', 2)
 WHERE notes LIKE '%DESVIACIÓN AUTORIZADA:%'
   AND authorized_deviation = false;

-- ─── El consumo escribe el dato, no la frase ────────────────────────────────
CREATE OR REPLACE FUNCTION public.consumir_lote(
  p_lot_id           UUID,
  p_ot_id            UUID,
  p_quantity         NUMERIC,
  p_by               UUID DEFAULT NULL,
  p_stage            TEXT DEFAULT NULL,
  p_override_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_lot    public.inventory_lots%ROWTYPE;
  v_item   public.inventory_items%ROWTYPE;
  v_ot     public.ots%ROWTYPE;
  v_req    public.certification_requirements%ROWTYPE;
  v_vence  DATE;
  v_dias   INTEGER;
  v_desvio BOOLEAN := false;
BEGIN
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote. El código puede estar borroso.';
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  SELECT * INTO v_item FROM inventory_items WHERE id = v_lot.item_id;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  IF COALESCE(v_lot.quantity_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'El lote % tiene % disponible y estás sacando %.',
      v_lot.lot_number, COALESCE(v_lot.quantity_available, 0), p_quantity;
  END IF;

  SELECT * INTO v_req FROM certification_requirements
   WHERE material_category = lower(COALESCE(v_item.category::text, ''));
  IF v_req.id IS NULL THEN
    SELECT * INTO v_req FROM certification_requirements WHERE material_category IS NULL;
  END IF;

  IF COALESCE(v_item.is_certification_required, false) THEN
    v_vence := v_lot.certification_expires_on;

    IF v_vence IS NULL THEN
      IF COALESCE(btrim(p_override_reason), '') = '' THEN
        RAISE EXCEPTION
          'El lote % no tiene certificado y % lo exige. Hace falta autorización de %.',
          v_lot.lot_number, COALESCE(v_item.name, 'este material'),
          COALESCE(v_req.override_role, 'Calidad');
      END IF;
      v_desvio := true;
    ELSE
      v_dias := v_vence - CURRENT_DATE;
      IF v_dias < COALESCE(v_req.min_days_valid_at_use, 0) THEN
        IF COALESCE(btrim(p_override_reason), '') = '' THEN
          RAISE EXCEPTION
            'El certificado del lote % venció el %. No puede ir a producción sin autorización de %.',
            v_lot.lot_number, to_char(v_vence, 'DD-MM-YYYY'),
            COALESCE(v_req.override_role, 'Calidad');
        END IF;
        v_desvio := true;
      END IF;
    END IF;
  END IF;

  INSERT INTO inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost,
    work_order_id, reference_code, notes, created_by,
    authorized_deviation, deviation_reason
  ) VALUES (
    v_lot.item_id, p_lot_id, 'consumption', p_quantity, COALESCE(v_lot.unit_cost, 0),
    p_ot_id, v_lot.lot_number, COALESCE(p_stage, 'consumo'), p_by,
    v_desvio,
    CASE WHEN v_desvio THEN btrim(p_override_reason) END
  );

  RETURN jsonb_build_object(
    'lot_number', v_lot.lot_number,
    'material', v_item.name,
    'ot_number', v_ot.ot_number,
    'quantity', p_quantity,
    'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'cert_expires', v_lot.certification_expires_on,
    'override', v_desvio
  );
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.consumir_lote(UUID, UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

-- ─── El veredicto, con los tres estados alcanzables ─────────────────────────
DROP VIEW IF EXISTS public.ot_certificacion;

CREATE VIEW public.ot_certificacion AS
SELECT
  o.id                       AS ot_id,
  o.ot_number,
  o.client_name,
  COUNT(DISTINCT l.id)       AS lotes_consumidos,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.certification_code IS NULL AND COALESCE(i.is_certification_required, false)
  )                          AS lotes_sin_certificado,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.certification_expires_on IS NOT NULL
      AND l.certification_expires_on < t.fecha_consumo
  )                          AS lotes_vencidos_al_usar,
  COUNT(DISTINCT l.id) FILTER (WHERE t.autorizado) AS lotes_con_desviacion,
  CASE
    WHEN COUNT(DISTINCT l.id) = 0 THEN 'sin_consumo'
    -- Primero lo que NO tiene autorización: es el hallazgo grave, el que
    -- significa que algo se escapó sin que nadie lo viera.
    WHEN COUNT(DISTINCT l.id) FILTER (
      WHERE NOT t.autorizado
        AND ( (l.certification_code IS NULL AND COALESCE(i.is_certification_required, false))
           OR (l.certification_expires_on IS NOT NULL AND l.certification_expires_on < t.fecha_consumo) )
    ) > 0 THEN 'no_conforme'
    -- Con autorización sigue siendo una desviación, pero CONTROLADA. Para una
    -- auditoría no es lo mismo, y colapsarlas borraba la única diferencia que
    -- el taller puede demostrar que gestionó.
    WHEN COUNT(DISTINCT l.id) FILTER (WHERE t.autorizado) > 0
      THEN 'con_desviacion_autorizada'
    ELSE 'conforme'
  END                        AS veredicto
FROM public.ots o
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (tx.lot_id)
         tx.lot_id,
         tx.created_at::date        AS fecha_consumo,
         tx.authorized_deviation    AS autorizado
    FROM public.inventory_stock_transactions tx
   WHERE tx.work_order_id = o.id AND tx.tx_type = 'consumption' AND tx.lot_id IS NOT NULL
   ORDER BY tx.lot_id, tx.created_at
) t ON TRUE
LEFT JOIN public.inventory_lots l ON l.id = t.lot_id
LEFT JOIN public.inventory_items i ON i.id = l.item_id
GROUP BY o.id, o.ot_number, o.client_name;

COMMENT ON VIEW public.ot_certificacion IS
  'Un veredicto por OT. Distingue la desviación AUTORIZADA de la que se escapó: para una auditoría no son el mismo hallazgo.';

COMMIT;

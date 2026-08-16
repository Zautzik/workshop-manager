-- El lote como eslabón físico
--
-- La trazabilidad ya existía en la base: el consumo exige `work_order_id`, y
-- `/api/recall?lot_id=` reconstruye hacia adelante. Lo que falta es el eslabón
-- del MUNDO FÍSICO — entre el pallet que está en bodega y la fila de la tabla
-- no hay nada. El operario que va a cortar no sabe qué lote tiene en la mano, y
-- si no lo sabe, no lo puede registrar.
--
-- Tres cosas:
--
--   1. UN número de lote, de una secuencia. Hoy conviven dos formatos —
--      `OC-00021-L231752` y `L-202605-0050`— y el primero además colisiona si
--      entran dos recepciones en el mismo segundo y no se puede ordenar por
--      fecha.
--
--   2. El bloqueo al CONSUMIR, no sólo al recibir. Hoy un lote con certificado
--      vencido no puede entrar, pero una vez adentro se consume sin que nadie
--      pregunte. El certificado puede vencer estando el papel en bodega — que
--      es el caso normal, no el raro.
--
--   3. Los requisitos declarados, no repartidos por el código. Una tabla chica
--      que dice qué exige cada familia de material, evaluada en los dos
--      momentos que importan.

BEGIN;

-- ─── 1 · Un número de lote ──────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.lote_seq START 1;

CREATE OR REPLACE FUNCTION public.generar_numero_lote()
RETURNS TEXT
LANGUAGE sql
AS $$
  -- L-2608-0001 · legible en una etiqueta, ordenable, y sin colisión posible
  -- porque el correlativo lo da la secuencia y no el reloj.
  SELECT 'L-' || to_char(now(), 'YYMM') || '-' ||
         lpad(nextval('public.lote_seq')::text, 4, '0');
$$;

COMMENT ON FUNCTION public.generar_numero_lote IS
  'El número que va impreso en la etiqueta del pallet. Uno solo para todo el taller.';

-- ─── 2 · El lote sabe si puede usarse ───────────────────────────────────────
ALTER TABLE inventory_lots
  -- Cuándo se imprimió la etiqueta. Un lote sin etiqueta impresa es un lote que
  -- nadie va a poder escanear: es un pendiente de bodega, no un dato de adorno.
  ADD COLUMN IF NOT EXISTS qr_printed_at TIMESTAMPTZ,
  -- Material retenido: llegó mal, se detectó un problema, está en cuarentena.
  -- Distinto de «certificado vencido», que es una condición que se calcula.
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_by     UUID,
  ADD COLUMN IF NOT EXISTS blocked_at     TIMESTAMPTZ;

COMMENT ON COLUMN inventory_lots.blocked_reason IS
  'Retención manual: llegó dañado, en cuarentena, no conforme. Nulo = disponible.';

-- ─── 3 · Los requisitos, declarados ─────────────────────────────────────────
--
-- ── Una sola fuente para cada pregunta ──────────────────────────────────────
--
-- `inventory_items.is_certification_required` YA existe y contesta «¿este
-- material exige certificado?». Poner esa misma pregunta acá crearía dos
-- verdades para un dato, que es el defecto que este proyecto lleva meses
-- cerrando. Así que esta tabla NO responde eso.
--
-- Responde la otra pregunta, la que hoy no vive en ningún lado: dado que lo
-- exige, QUÉ TAN ESTRICTO es el control — cuántos días de margen hacen falta y
-- quién puede autorizar una desviación. El ítem dice «si»; esto dice «cómo».
--
-- Chica a propósito. La tentación es un módulo de cumplimiento configurable;
-- lo que un taller necesita es que la regla esté escrita en un lugar y que el
-- sistema la aplique solo.
CREATE TABLE IF NOT EXISTS certification_requirements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Un valor del enum `inventory_item_category`: tool | supply |
  -- product_input | spare_part. Se guarda como TEXT y no como el enum a
  -- proposito: si manana se agrega una categoria, esta tabla no necesita
  -- migrarse — la regla por defecto la cubre.
  --
  -- Nulo = la politica por defecto para toda categoria sin fila propia.
  material_category TEXT UNIQUE,
  -- Días de margen: un certificado que vence durante el tiraje ya es un
  -- problema. 0 = basta que esté vigente el día que se consume.
  min_days_valid_at_use INTEGER NOT NULL DEFAULT 0,
  -- Quién puede autorizar una desviación. Se guarda como texto porque es una
  -- política del taller, no un rol del sistema.
  override_role TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE certification_requirements IS
  'Qué exige cada familia de material. Se evalúa al recibir y al consumir — los dos momentos donde todavía se puede hacer algo.';

-- `product_input` es lo que entra al producto —cartulina, papel, tinta,
-- adhesivo— y por lo tanto lo que toca el alimento. Herramientas, insumos de
-- maquina y repuestos no lo tocan, y exigirles certificado seria burocracia que
-- termina con alguien inventando un numero para poder seguir.
--
-- El margen en 0 es deliberado y conservador: basta que el certificado este
-- vigente el dia que se consume. Subirlo a 30 en `product_input` es una
-- decision del taller, y ahora hay donde escribirla.
INSERT INTO certification_requirements (material_category, min_days_valid_at_use, override_role, notes)
VALUES
  ('product_input', 0, 'Jefe de Calidad', 'Entra al producto: contacto con alimento.'),
  (NULL,            0, 'Jefe de Calidad', 'Politica por defecto para el resto.')
ON CONFLICT (material_category) DO NOTHING;

-- ─── 4 · Consumir un lote, con la puerta puesta ─────────────────────────────
--
-- Es la función que llama el escaneo. Hace las tres cosas juntas —verificar,
-- descontar y dejar la traza— porque separarlas permite que exista un consumo
-- sin verificación, que es exactamente lo que hay que impedir.
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
AS $$
DECLARE
  v_lot    public.inventory_lots%ROWTYPE;
  v_item   public.inventory_items%ROWTYPE;
  v_ot     public.ots%ROWTYPE;
  v_req    public.certification_requirements%ROWTYPE;
  v_vence  DATE;
  v_dias   INTEGER;
BEGIN
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote. ¿El código está borroso?';
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  SELECT * INTO v_item FROM inventory_items WHERE id = v_lot.item_id;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  -- Retención manual: es lo primero porque es una decisión humana explícita y
  -- gana sobre cualquier cálculo.
  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  IF COALESCE(v_lot.quantity_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'El lote % tiene % disponible y estás sacando %.',
      v_lot.lot_number, COALESCE(v_lot.quantity_available, 0), p_quantity;
  END IF;

  -- ── La puerta de certificación ──────────────────────────────────────────
  --
  -- Al RECIBIR ya se verificó, pero un certificado vence estando el papel en
  -- bodega — ese es el caso normal, no el raro. Verificar sólo en la puerta de
  -- entrada deja pasar por la de salida.
  SELECT * INTO v_req FROM certification_requirements
   WHERE material_category = lower(COALESCE(v_item.category::text, ''));
  IF v_req.id IS NULL THEN
    SELECT * INTO v_req FROM certification_requirements WHERE material_category IS NULL;
  END IF;

  -- El «si» lo dice el ITEM —una sola fuente— y el «como» esta tabla.
  IF COALESCE(v_item.is_certification_required, false) THEN
    v_vence := v_lot.certification_expires_on;

    IF v_vence IS NULL THEN
      IF COALESCE(btrim(p_override_reason), '') = '' THEN
        RAISE EXCEPTION
          'El lote % no tiene certificado y % lo exige. Hace falta autorización de %.',
          v_lot.lot_number, COALESCE(v_item.name, 'este material'),
          COALESCE(v_req.override_role, 'Calidad');
      END IF;
    ELSE
      v_dias := v_vence - CURRENT_DATE;
      IF v_dias < COALESCE(v_req.min_days_valid_at_use, 0) THEN
        IF COALESCE(btrim(p_override_reason), '') = '' THEN
          RAISE EXCEPTION
            'El certificado del lote % venció el %. No puede ir a producción sin autorización de %.',
            v_lot.lot_number, to_char(v_vence, 'DD-MM-YYYY'),
            COALESCE(v_req.override_role, 'Calidad');
        END IF;
      END IF;
    END IF;
  END IF;

  -- El movimiento. `work_order_id` es lo que forma la cadena hacia adelante:
  -- de este lote a esta OT, y de esta OT a su cliente.
  INSERT INTO inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost,
    work_order_id, reference_code, notes, created_by
  ) VALUES (
    v_lot.item_id, p_lot_id, 'consumption', p_quantity, COALESCE(v_lot.unit_cost, 0),
    p_ot_id,
    v_lot.lot_number,
    COALESCE(p_stage, 'consumo') ||
      CASE WHEN COALESCE(btrim(p_override_reason), '') <> ''
           THEN ' · DESVIACIÓN AUTORIZADA: ' || p_override_reason
           ELSE '' END,
    p_by
  );

  RETURN jsonb_build_object(
    'lot_number', v_lot.lot_number,
    'material', v_item.name,
    'ot_number', v_ot.ot_number,
    'quantity', p_quantity,
    'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'cert_expires', v_lot.certification_expires_on,
    'override', COALESCE(btrim(p_override_reason), '') <> ''
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consumir_lote(UUID, UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.consumir_lote IS
  'Consume un lote contra una OT: verifica retención, saldo y certificado vigente, y deja la traza. Las tres juntas a propósito — separarlas permitiría un consumo sin verificar.';

-- ─── 5 · El veredicto de la OT, en una fila ─────────────────────────────────
--
-- La pregunta que hace un auditor no es «mostrame los lotes»: es «¿esta orden
-- es conforme?». Una sola respuesta por OT, calculada de los lotes que
-- efectivamente consumió.
CREATE OR REPLACE VIEW public.ot_certificacion AS
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
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.cert_override_reason IS NOT NULL
  )                          AS lotes_con_desviacion,
  CASE
    WHEN COUNT(DISTINCT l.id) = 0 THEN 'sin_consumo'
    WHEN COUNT(DISTINCT l.id) FILTER (
      WHERE (l.certification_code IS NULL AND COALESCE(i.is_certification_required, false))
         OR (l.certification_expires_on IS NOT NULL AND l.certification_expires_on < t.fecha_consumo)
    ) > 0 THEN 'no_conforme'
    WHEN COUNT(DISTINCT l.id) FILTER (WHERE l.cert_override_reason IS NOT NULL) > 0
      THEN 'con_desviacion_autorizada'
    ELSE 'conforme'
  END                        AS veredicto
FROM public.ots o
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (tx.lot_id) tx.lot_id, tx.created_at::date AS fecha_consumo
    FROM public.inventory_stock_transactions tx
   WHERE tx.work_order_id = o.id AND tx.tx_type = 'consumption' AND tx.lot_id IS NOT NULL
   ORDER BY tx.lot_id, tx.created_at
) t ON TRUE
LEFT JOIN public.inventory_lots l ON l.id = t.lot_id
LEFT JOIN public.inventory_items i ON i.id = l.item_id
LEFT JOIN public.certification_requirements r
       ON r.material_category = lower(COALESCE(i.category::text, ''))
GROUP BY o.id, o.ot_number, o.client_name;

COMMENT ON VIEW public.ot_certificacion IS
  'Un veredicto por OT: conforme / con desviación autorizada / no conforme. Es la pregunta que hace un auditor, contestada sin tener que leer lotes.';

COMMIT;

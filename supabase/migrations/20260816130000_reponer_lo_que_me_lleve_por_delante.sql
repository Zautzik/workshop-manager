-- Reponer lo que me llevé por delante
--
-- La migración anterior reescribió `receive_oc_into_lot` tomando como base la
-- versión de julio 10 sin ver que el 12 había otra más nueva. Al borrar todas
-- las sobrecargas por nombre y crear la mía, se perdieron tres cosas:
--
--   1. la validación de que el material existe (`inventory_items`)
--   2. el parámetro `p_recorded_by`, que la ruta de la API sí manda — o sea que
--      la recepción estaba fallando por firma equivocada
--   3. EL ASIENTO EN `ot_real_costs`, que es lo más grave: recibir papel contra
--      una OT dejaba de registrarse como costo real. Es exactamente el defecto
--      que la migración del 12 de julio existía para arreglar — la auditoría de
--      julio recibió $2,3M de cartulina y el análisis de costos mostraba cero.
--
-- La lección, anotada donde se va a volver a leer: antes de reemplazar una
-- función hay que buscar TODAS las migraciones que la definen, no la primera
-- que aparece. `grep -l` sobre el directorio, no memoria.
--
-- Esta repone la versión del 12 de julio íntegra y le agrega encima lo que la
-- certificación necesita.

BEGIN;

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS firma
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'receive_oc_into_lot'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f.firma);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.receive_oc_into_lot(
  p_purchase_id  UUID,
  p_item_id      UUID,
  p_quantity     NUMERIC,
  p_unit_cost    NUMERIC DEFAULT NULL,
  p_lot_number   TEXT    DEFAULT NULL,
  p_cert_code    TEXT    DEFAULT NULL,
  p_cert_expires DATE    DEFAULT NULL,
  -- Se conserva el nombre original: la ruta de la API ya lo manda así, y
  -- renombrarlo fue la mitad del problema anterior.
  p_recorded_by  UUID    DEFAULT NULL,
  p_variance_reason      TEXT DEFAULT NULL,
  p_cert_override_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p          public.purchases%ROWTYPE;
  v_item       public.inventory_items%ROWTYPE;
  v_lot_id     UUID;
  v_lot_number TEXT;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'OC no encontrada: %', p_purchase_id;
  END IF;

  -- NUEVO · No se recibe contra un borrador ni contra una OC anulada. Si no se
  -- emitió, no se pidió, y recibir contra la nada deja un lote sin documento.
  IF v_p.status = 'draft' THEN
    RAISE EXCEPTION 'La OC todavía es un borrador: emitila antes de recibir.';
  END IF;
  IF v_p.status = 'cancelled' THEN
    RAISE EXCEPTION 'La OC % está anulada.', COALESCE(v_p.oc_number, '(sin número)');
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el material recibido.';
  END IF;
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Material no encontrado: %', p_item_id;
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad recibida inválida.';
  END IF;

  -- NUEVO · FSSC 22000: material sin certificado vigente no entra a producción.
  -- No es prohibición absoluta —a veces el certificado llega dos días tarde y el
  -- trabajo no espera— pero pasar igual exige autorización nominal. Esa es la
  -- diferencia entre un control y un cartel.
  IF p_cert_expires IS NOT NULL
     AND p_cert_expires < CURRENT_DATE
     AND COALESCE(btrim(p_cert_override_reason), '') = '' THEN
    RAISE EXCEPTION
      'El certificado del lote venció el % y no puede entrar a producción sin autorización escrita.',
      to_char(p_cert_expires, 'DD-MM-YYYY');
  END IF;

  v_lot_number := COALESCE(NULLIF(p_lot_number, ''),
                           COALESCE(v_p.oc_number, 'OC') || '-L' || to_char(now(), 'HH24MISS'));

  -- El lote nace en 0: la transacción de compra es el único escritor de la
  -- disponibilidad (`trg_sync_inventory_lot_quantities` la suma), así que el
  -- saldo y el libro no pueden discrepar.
  INSERT INTO public.inventory_lots (
    item_id, lot_number, purchase_id, supplier_name, received_date,
    unit_cost, quantity_received, quantity_available,
    certification_code, certification_expires_on,
    received_by, variance_reason, cert_override_by, cert_override_reason
  ) VALUES (
    p_item_id, v_lot_number, p_purchase_id, v_p.supplier, CURRENT_DATE,
    COALESCE(p_unit_cost, 0), p_quantity, 0,
    p_cert_code, p_cert_expires,
    p_recorded_by,
    NULLIF(btrim(COALESCE(p_variance_reason, '')), ''),
    CASE WHEN COALESCE(btrim(p_cert_override_reason), '') <> '' THEN p_recorded_by END,
    NULLIF(btrim(COALESCE(p_cert_override_reason, '')), '')
  )
  RETURNING id INTO v_lot_id;

  INSERT INTO public.inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes
  ) VALUES (
    p_item_id, v_lot_id, 'purchase', p_quantity, COALESCE(p_unit_cost, 0),
    v_p.oc_number, 'Recepción de ' || COALESCE(v_p.oc_number, 'OC')
  );

  -- REPUESTO · El motor de costos. `workflow_step = 'oc_receipt'` a propósito y
  -- no un estado de OT: el diálogo manual de costos reales borra por paso al
  -- reemplazar, así que una clave distinta protege las líneas automáticas de
  -- una corrección hecha a mano.
  IF v_p.ot_id IS NOT NULL THEN
    INSERT INTO public.ot_real_costs (
      ot_id, workflow_step, operation_code, description, category,
      quantity, unit, unit_cost, recorded_by, notes
    ) VALUES (
      v_p.ot_id, 'oc_receipt', v_lot_number,
      'Recepción ' || COALESCE(v_p.oc_number, 'OC') || ' — ' || v_item.name,
      'materiales',
      p_quantity, COALESCE(v_item.unit, 'unit'), COALESCE(p_unit_cost, 0),
      p_recorded_by,
      'Automático: recepción de OC en bodega (lote ' || v_lot_number || ')'
    );
  END IF;

  -- Sólo desde 'sent': 'draft' ya se rechazó arriba, y una OC facturada o
  -- cerrada no vuelve a 'received' por una recepción parcial tardía.
  UPDATE public.purchases
     SET status = 'received', updated_at = now()
   WHERE id = p_purchase_id AND status = 'sent';

  PERFORM public.sync_purchase_ledger(p_purchase_id);

  RETURN v_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_oc_into_lot(
  UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.receive_oc_into_lot(
  UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT, TEXT
) IS
  'Recibe material de una OC emitida: lote con trazabilidad FSSC, bloqueo por certificado vencido salvo autorización nominal, movimiento de stock, y asiento en ot_real_costs cuando la OC cuelga de una OT.';

COMMIT;

-- El corte de fecha saca al stock legado de la reconciliación
--
-- reconciliar_inventario() (20260915140000) marcó 236 de 239 lotes al primer
-- corrido real. Inspeccionados, todos muestran quantity_available en 0 contra
-- un libro NEGATIVO (p. ej. -945): son "lotes parados" -- stock que ya existía
-- antes de que esta convención (toda entrada y salida deja una transacción)
-- empezara a regir, consumido después por el camino correcto. El saldo nunca
-- estuvo mal; el libro simplemente nunca tuvo la entrada de apertura.
--
-- Un control que marca el 98,7% del inventario el primer día no es una señal,
-- es ruido -- exactamente lo que MASTERCLASS.md §II.6 advierte: "un control
-- que cierra el hueco pero miente se apaga en un mes". Decisión del taller
-- (2026-10-02): en vez de escribirle una transacción de apertura ficticia a
-- cada lote legado, el chequeo simplemente deja de mirar lo que llegó antes
-- de que la convención existiera. Esos lotes quedan fuera de este control
-- para siempre, no "resueltos" -- es la otra cara de la misma decisión:
-- más simple, pero el stock viejo nunca se vigila por esta vía.

BEGIN;

CREATE OR REPLACE FUNCTION public.reconciliar_inventario()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_corte CONSTANT DATE := DATE '2026-09-15';
BEGIN
  WITH libro AS (
    SELECT
      l.id AS lot_id,
      l.item_id,
      l.quantity_available,
      COALESCE(SUM(
        CASE WHEN t.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN t.quantity
             WHEN t.tx_type IN ('consumption', 'adjustment_out') THEN -t.quantity
             ELSE 0 END
      ), 0) AS quantity_ledger
    FROM public.inventory_lots l
    LEFT JOIN public.inventory_stock_transactions t ON t.lot_id = l.id
    WHERE l.received_date >= v_corte
    GROUP BY l.id, l.item_id, l.quantity_available
  )
  INSERT INTO public.inventory_reconciliation_alerts
    (lot_id, item_id, quantity_available, quantity_ledger, drift, detected_at)
  SELECT lot_id, item_id, quantity_available, quantity_ledger,
         quantity_available - quantity_ledger, now()
  FROM libro
  WHERE quantity_available <> quantity_ledger
  ON CONFLICT (lot_id) DO UPDATE SET
    quantity_available = EXCLUDED.quantity_available,
    quantity_ledger     = EXCLUDED.quantity_ledger,
    drift               = EXCLUDED.drift,
    detected_at         = now();

  -- Un lote dentro del corte que vuelve a cuadrar sale de la lista.
  WITH libro AS (
    SELECT
      l.id AS lot_id,
      l.quantity_available,
      COALESCE(SUM(
        CASE WHEN t.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN t.quantity
             WHEN t.tx_type IN ('consumption', 'adjustment_out') THEN -t.quantity
             ELSE 0 END
      ), 0) AS quantity_ledger
    FROM public.inventory_lots l
    LEFT JOIN public.inventory_stock_transactions t ON t.lot_id = l.id
    WHERE l.received_date >= v_corte
    GROUP BY l.id, l.quantity_available
  )
  DELETE FROM public.inventory_reconciliation_alerts a
  USING libro b
  WHERE a.lot_id = b.lot_id AND b.quantity_available = b.quantity_ledger;

  -- Un lote legado (anterior al corte) ya no está en el alcance de este
  -- control -- su alerta, si tenía una abierta de antes de esta migración,
  -- se retira. No es "resuelto": es "fuera de este chequeo".
  DELETE FROM public.inventory_reconciliation_alerts a
  USING public.inventory_lots l
  WHERE a.lot_id = l.id AND l.received_date < v_corte;

  SELECT count(*) INTO v_count FROM public.inventory_reconciliation_alerts;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.reconciliar_inventario IS
  'Compara quantity_available contra la suma firmada de inventory_stock_transactions por lote, sólo para lotes recibidos desde 2026-09-15 (cuando esta convención empezó a regir). El stock anterior a esa fecha queda fuera del chequeo a propósito -- ver comentario de la migración 20261002120000.';

COMMIT;

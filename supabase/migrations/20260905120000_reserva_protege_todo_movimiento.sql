-- La reserva protege todo movimiento, no sólo el que pasa por consumir_lote()
--
-- `inventory_stock_transactions` tiene dos escritores. El escaneo de QR pasa
-- por `consumir_lote()` (el_consumo_respeta_la_reserva.sql), que antes de
-- descontar resta lo reservado por OTRAS órdenes y rechaza si no alcanza. El
-- movimiento manual del panel de administración (`POST /api/inventory/
-- transactions`, InventoryManagement.tsx "Crear movimiento de stock") NO pasa
-- por ahí: inserta directo en `inventory_stock_transactions`, y lo único que
-- lo frena es este trigger — que hasta ahora sólo miraba `quantity_available`,
-- sin saber que `inventory_reservations` existe.
--
-- El resultado: una OT que reservó papel para su trabajo puede perderlo si
-- alguien registra un "Consumo" manual contra el mismo lote para otra OT. No
-- hace falta mala intención — el operador del panel no tiene forma de saber
-- que ese pallet ya está comprometido, porque la pantalla de movimientos no
-- lo muestra. Encontrado por auditoría de flujo de datos (2026-09-04), no en
-- producción — pero es exactamente la clase de defecto que sólo aparece con
-- dos personas actuando a la vez, que nunca pasa en una prueba manual.
--
-- La solución no es enseñarle la regla a la ruta manual: sería la tercera
-- copia de la misma condición (la primera vive en consumir_lote, y duplicarla
-- en TypeScript es exactamente el tipo de deriva que ya rompió el trigger una
-- vez — ver movement_types_como_datos.sql). Se mueve la condición al ÚNICO
-- lugar por el que pasan todos los escritores: este trigger. Así la regla
-- vale sin importar qué inserte la fila, hoy o el día que se agregue un
-- tercer camino.
--
-- El `FOR UPDATE` se toma ANTES de mirar reservas, no después — el mismo
-- orden que bloquear_la_fila_y_reemplazar_sin_perder.sql estableció para
-- consumir_lote: sin bloquear primero, dos movimientos de salida contra el
-- mismo lote podrían leer las reservas ANTES de que ninguno de los dos haya
-- comprometido nada, y los dos pasarían el chequeo.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_inventory_lot_quantities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta       NUMERIC(12,3);
  v_item_id     UUID;
  v_lot_item_id UUID;
  v_direction   TEXT;
  v_ajena       NUMERIC(14,2);
BEGIN
  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Inventory transaction requires lot_id for traceability.';
  END IF;

  -- Bloquea la fila del lote ANTES de mirar reservas o saldo: es lo que hace
  -- que el chequeo de abajo (y el UPDATE de más abajo) vean el estado real,
  -- no uno que otro movimiento concurrente todavía no terminó de escribir.
  SELECT item_id INTO v_lot_item_id
  FROM public.inventory_lots
  WHERE id = NEW.lot_id
  FOR UPDATE;

  IF v_lot_item_id IS NULL THEN
    RAISE EXCEPTION 'Lot % not found.', NEW.lot_id;
  END IF;

  v_item_id := COALESCE(NEW.item_id, v_lot_item_id);

  IF v_item_id <> v_lot_item_id THEN
    RAISE EXCEPTION 'Lot % does not belong to item %.', NEW.lot_id, v_item_id;
  END IF;

  NEW.item_id := v_item_id;

  SELECT direction INTO v_direction
  FROM public.movement_types
  WHERE code = NEW.tx_type AND active;

  IF v_direction IS NULL THEN
    RAISE EXCEPTION 'Unsupported or inactive inventory transaction type %', NEW.tx_type;
  END IF;

  -- ── La reserva, para CUALQUIER salida ────────────────────────────────────
  --
  -- `consumir_lote()` ya resta su PROPIA reserva antes de llegar acá (la
  -- consume, no la pisa) — por eso se excluye `NEW.work_order_id` del cálculo
  -- de lo ajeno. Un movimiento sin OT (un ajuste que no dice para quién es)
  -- no puede excluir nada: si el lote tiene algo reservado, todo lo reservado
  -- cuenta como ajeno.
  IF v_direction = 'out' THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_ajena
      FROM public.inventory_reservations
     WHERE lot_id = NEW.lot_id
       AND status = 'activa'
       AND expires_at > now()
       AND (NEW.work_order_id IS NULL OR ot_id <> NEW.work_order_id);

    IF v_ajena > 0 THEN
      PERFORM 1 FROM public.inventory_lots
       WHERE id = NEW.lot_id
         AND quantity_available - v_ajena >= NEW.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Lot % has % committed to other work orders; this movement would consume reserved material.',
          NEW.lot_id, v_ajena;
      END IF;
    END IF;
  END IF;

  v_delta := CASE WHEN v_direction = 'in' THEN NEW.quantity ELSE -NEW.quantity END;

  UPDATE public.inventory_lots
  SET quantity_available = quantity_available + v_delta
  WHERE id = NEW.lot_id
    AND quantity_available + v_delta >= 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock in lot % for quantity %.', NEW.lot_id, NEW.quantity;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_inventory_lot_quantities() IS
  'Único escritor de inventory_lots.quantity_available. Bloquea la fila del lote, rechaza una salida
   que comería stock reservado por OTRA OT (inventory_reservations), y sólo entonces aplica el delta.
   Vale para todo insert en inventory_stock_transactions, venga de consumir_lote() o de la ruta manual
   de movimientos — la regla vive acá una sola vez.';

COMMIT;

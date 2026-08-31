-- Tipos de movimiento de inventario, como datos.
--
-- Hasta ahora "¿este movimiento suma o resta stock?" vivía hardcodeado en dos
-- lugares que tenían que mantenerse sincronizados a mano: la lista IN() del
-- trigger que sostiene `quantity_available`, y el refine() de Zod que decide
-- si un movimiento exige OT. Agregar un tipo nuevo (ej. "merma", "traspaso a
-- otra sucursal") pedía tocar ambos y no fallaba si alguien se olvidaba de uno
-- — el movimiento se guardaba pero el stock agregado quedaba mal, o al revés.
--
-- Esta tabla es la única fuente de verdad de esa dirección. La columna
-- `tx_type` sigue siendo el enum `inventory_tx_type` (lo tipan tres funciones
-- más, y cambiarla a texto+FK es una migración más grande que esto no
-- necesita todavía) — pero el enum ya no decide nada por sí solo, sólo acota
-- qué códigos son sintácticamente válidos. El significado vive acá.
CREATE TABLE IF NOT EXISTS public.movement_types (
  code        public.inventory_tx_type PRIMARY KEY,
  label       TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  requires_ot BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.movement_types (code, label, direction, requires_ot, sort_order) VALUES
  ('purchase',        'Compra recibida',      'in',  false, 1),
  ('consumption',     'Consumo en OT',         'out', true,  2),
  ('adjustment_in',   'Ajuste a favor',        'in',  false, 3),
  ('adjustment_out',  'Ajuste en contra',      'out', false, 4),
  ('return_to_stock', 'Devolución a bodega',   'in',  false, 5)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.movement_types IS
  'Qué significa cada tipo de movimiento: si suma o resta stock (direction) y si exige OT
   (requires_ot). Fuente única para el trigger de sincronización y para la validación de la
   ruta de movimientos — antes cada uno tenía su propia copia de esta regla.';

ALTER TABLE public.movement_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movement_types_select_authenticated ON public.movement_types;
CREATE POLICY movement_types_select_authenticated ON public.movement_types
  FOR SELECT TO authenticated USING (true);

-- El trigger ahora lee la dirección de la tabla en vez de una lista IN()
-- hardcodeada. Mismo comportamiento para los cinco tipos existentes —
-- verificado 1:1 contra la versión anterior — pero uno nuevo ya no pide tocar
-- esta función, sólo insertar la fila (y el ALTER TYPE ADD VALUE del enum).
CREATE OR REPLACE FUNCTION public.sync_inventory_lot_quantities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC(12,3);
  v_item_id UUID;
  v_lot_item_id UUID;
  v_direction TEXT;
BEGIN
  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Inventory transaction requires lot_id for traceability.';
  END IF;

  SELECT item_id INTO v_lot_item_id
  FROM public.inventory_lots
  WHERE id = NEW.lot_id;

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

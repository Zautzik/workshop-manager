-- ════════════════════════════════════════════════════════════════════════════
-- El material y la máquina cuestan cuando se consumen.
--   · Material: al consumirse de bodega, al precio real del lote usado.
--   · Máquina: al cerrarse la pasada que la usó (horas, o clics en digital),
--     y sólo así (stage-valuation.ts, ref_type 'stage_pass').
-- Al final, la siembra de prueba se completa para que cumpla la regla.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Máquina (dueño, 2026-11-10: «el tiempo de máquina se registra cuando se
-- consume»). Cinco escritores ponían horas de máquina en la OT: la siembra
-- («Hora de prensa — Ryobi», 2.297 h sin una sola pasada detrás), el diálogo
-- del tablero (la cotización copiada, incluido «Operador de Prensa», que es
-- mano de obra archivada como máquina), el parte de WhatsApp, la entrada
-- manual y la pasada. Sólo la pasada es consumo: la máquina estuvo ocupada
-- esas horas en esa OT. Las demás se van.
--
-- Auditoría 2026-11-09. OT 41221 mostraba $5.402.880 de material real contra
-- $960.000 de papel efectivamente comprado. Seis caminos escribían plata de
-- material en el libro de la OT, cada uno por su cuenta:
--
--   1. el diálogo del tablero copiaba la COTIZACIÓN como costo real;
--   2. la recepción de la OC (receive_oc_into_lot);
--   3. la factura conciliada (sync_purchase_ledger), que además NO borraba la
--      línea de la recepción: toda OC recibida y facturada contaba dos veces;
--   4. el parte de WhatsApp, que infería papel y tinta de los pliegos;
--   5. y 6. dos entradas manuales sin validar categoría.
--
-- Y al revés: el papel que salía de stock (escaneo, backflush, captura QR) no
-- llegaba NUNCA al costo de la OT — consumir_lote sólo movía inventario.
--
-- Regla (decisión del dueño, 2026-11-10):
--
--   · El costo de material entra a la OT cuando se CONSUME, y sólo entonces.
--   · Al costo real del lote consumido. El precio del papel varía mucho: ni la
--     cotización ni el catálogo sirven para el real.
--   · La cotización vive en su propio carril (kind = 'estimate') y se usa
--     después, para analizar la brecha y sus causas.
--   · Se mantiene la trazabilidad por lote; la tinta se consume por kg, de su
--     lote, igual que el papel.
--
-- Un solo escritor: el movimiento de inventario contra una OT. Este trigger es
-- el único lugar donde un kilo o un pliego se vuelve plata del libro.
-- consumir_lote es el único escritor de consumos contra OT (con sus guardias
-- de retención, saldo, reserva y certificado). Lo demás —parte, diálogo,
-- entradas manuales— aporta cantidades, nunca pesos de material.

-- ── 1. El precio con que llegó el lote, para poder re-tasarlo ───────────────
-- La factura corrige el precio de la OC. Re-tasar desde el precio ORIGINAL
-- (no desde el actual) hace la re-tasación idempotente: sincronizar dos veces
-- no multiplica dos veces.
ALTER TABLE public.inventory_lots ADD COLUMN IF NOT EXISTS oc_unit_cost NUMERIC;
COMMENT ON COLUMN public.inventory_lots.oc_unit_cost IS
  'Precio unitario al recibir (el de la OC). unit_cost = oc_unit_cost × (neto facturado / total OC) cuando la factura se concilia.';
UPDATE public.inventory_lots SET oc_unit_cost = unit_cost WHERE oc_unit_cost IS NULL;

-- ── 2. Las devoluciones a bodega acreditan ─────────────────────────────────
ALTER TABLE public.ot_cost_lines DROP CONSTRAINT IF EXISTS ot_cost_lines_quantity_check;
ALTER TABLE public.ot_cost_lines ADD CONSTRAINT ot_cost_lines_quantity_check
  CHECK (quantity >= 0 OR source = 'devolucion');

-- ── 3. El único escritor de material en el libro ───────────────────────────
CREATE OR REPLACE FUNCTION public.cost_ot_material_movement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_item   public.inventory_items%ROWTYPE;
  v_lot    public.inventory_lots%ROWTYPE;
  v_cost   NUMERIC;
  v_return BOOLEAN;
BEGIN
  -- Re-derivar, no parchar: la línea es función del movimiento.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.ot_cost_lines WHERE ref_type = 'inventory_tx' AND ref_id = OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.work_order_id IS NULL OR NEW.tx_type NOT IN ('consumption', 'return_to_stock') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = NEW.item_id;
  SELECT * INTO v_lot  FROM public.inventory_lots  WHERE id = NEW.lot_id;
  -- El lote manda: es lo que efectivamente se pagó por ESE material.
  v_cost   := COALESCE(NULLIF(v_lot.unit_cost, 0), NULLIF(NEW.unit_cost, 0), 0);
  v_return := NEW.tx_type = 'return_to_stock';

  INSERT INTO public.ot_cost_lines (
    ot_id, kind, category, source, description, quantity, unit, unit_cost,
    ref_type, ref_id, occurred_at, recorded_by, notes
  ) VALUES (
    NEW.work_order_id, 'actual', 'material',
    CASE WHEN v_return THEN 'devolucion' ELSE 'consumo' END,
    CASE WHEN v_return THEN 'Devolución a bodega — ' ELSE '' END
      || COALESCE(v_item.name, 'Material') || COALESCE(' · lote ' || v_lot.lot_number, ''),
    CASE WHEN v_return THEN -NEW.quantity ELSE NEW.quantity END,
    COALESCE(v_item.unit, 'unit'), v_cost,
    'inventory_tx', NEW.id, NEW.created_at, NEW.created_by,
    CASE WHEN v_cost = 0
      THEN 'Sin costo: el lote no tiene precio. Se corrige al conciliar la factura de su OC.'
      ELSE NULLIF(NEW.notes, '') END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cost_ot_material_movement ON public.inventory_stock_transactions;
CREATE TRIGGER trg_cost_ot_material_movement
  AFTER INSERT OR UPDATE OF work_order_id, tx_type, quantity, unit_cost, lot_id OR DELETE
  ON public.inventory_stock_transactions
  FOR EACH ROW EXECUTE FUNCTION public.cost_ot_material_movement();

COMMENT ON FUNCTION public.cost_ot_material_movement() IS
  'Único escritor de material real en ot_cost_lines: cada consumo (o devolución) contra una OT, al costo de su lote. Migración 20261110120000.';

-- ── 4. Nadie más escribe material ni máquina real ──────────────────────────
-- Material: sólo un movimiento de inventario (o la maqueta, muestra hecha a
-- mano con material de mesa, sin lote). Máquina: sólo una pasada cerrada.
-- La siembra de demo queda exenta.
CREATE OR REPLACE FUNCTION public.actual_cost_only_when_consumed() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind <> 'actual' OR NEW.source = 'seed' THEN RETURN NEW; END IF;

  IF NEW.category = 'material' AND COALESCE(NEW.ref_type, '') NOT IN ('inventory_tx', 'maqueta') THEN
    RAISE EXCEPTION 'El material se carga a la OT cuando se consume desde bodega (escaneo, backflush o captura), al costo real de su lote. «%» no puede escribirlo directo.', NEW.source
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.category = 'machine' AND COALESCE(NEW.ref_type, '') <> 'stage_pass' THEN
    RAISE EXCEPTION 'El tiempo de máquina se carga a la OT cuando se cierra la pasada que lo usó (horas, o clics en digital). «%» no puede escribirlo directo.', NEW.source
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actual_cost_only_when_consumed ON public.ot_cost_lines;
CREATE TRIGGER trg_actual_cost_only_when_consumed
  BEFORE INSERT ON public.ot_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.actual_cost_only_when_consumed();

COMMENT ON FUNCTION public.actual_cost_only_when_consumed() IS
  'Material real sólo desde un movimiento de inventario; máquina real sólo desde una pasada cerrada. Migración 20261110120000.';

-- ── 5. consumir_lote: devuelve el movimiento y habla en la unidad del ítem ──
-- La tinta se consume en kg: «tiene 3 pliegos» era falso para ella, y el
-- redondeo a entero se comía 1,6 kg.
CREATE OR REPLACE FUNCTION public.consumir_lote(
  p_lot_id UUID, p_ot_id UUID, p_quantity NUMERIC,
  p_by UUID DEFAULT NULL, p_stage TEXT DEFAULT NULL, p_override_reason TEXT DEFAULT NULL
) RETURNS JSONB
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot     public.inventory_lots%ROWTYPE;
  v_item    public.inventory_items%ROWTYPE;
  v_ot      public.ots%ROWTYPE;
  v_req     public.certification_requirements%ROWTYPE;
  v_vence   DATE;
  v_dias    INTEGER;
  v_desvio  BOOLEAN := false;
  v_propia  NUMERIC := 0;
  v_ajena   NUMERIC := 0;
  v_libre   NUMERIC;
  v_unidad  TEXT;
  v_tx_id   UUID;
BEGIN
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote. El código puede estar borroso.';
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  SELECT * INTO v_item FROM inventory_items WHERE id = v_lot.item_id;
  v_unidad := COALESCE(NULLIF(v_item.unit, ''), 'unidades');

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  IF COALESCE(v_lot.quantity_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'El lote % tiene % % y estás sacando %.',
      v_lot.lot_number, trim_scale(round(COALESCE(v_lot.quantity_available, 0), 2)), v_unidad,
      trim_scale(round(p_quantity, 2));
  END IF;

  SELECT COALESCE(SUM(quantity) FILTER (WHERE ot_id = p_ot_id), 0),
         COALESCE(SUM(quantity) FILTER (WHERE ot_id <> p_ot_id), 0)
    INTO v_propia, v_ajena
    FROM inventory_reservations
   WHERE lot_id = p_lot_id AND status = 'activa' AND expires_at > now();

  v_libre := COALESCE(v_lot.quantity_available, 0) - v_ajena;
  IF p_quantity > v_libre THEN
    RAISE EXCEPTION
      'Del lote % hay % % sin comprometer: el resto está reservado para otra orden.',
      v_lot.lot_number, trim_scale(round(GREATEST(v_libre, 0), 2)), v_unidad;
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

  -- Este INSERT es el que cuesta la OT (trg_cost_ot_material_movement).
  INSERT INTO inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost,
    work_order_id, reference_code, notes, created_by,
    authorized_deviation, deviation_reason
  ) VALUES (
    v_lot.item_id, p_lot_id, 'consumption', p_quantity, COALESCE(v_lot.unit_cost, 0),
    p_ot_id, v_lot.lot_number, COALESCE(p_stage, 'consumo'), p_by,
    v_desvio, CASE WHEN v_desvio THEN btrim(p_override_reason) END
  )
  RETURNING id INTO v_tx_id;

  IF v_propia > 0 THEN
    IF p_quantity >= v_propia THEN
      UPDATE inventory_reservations
         SET status = 'consumida', released_at = now()
       WHERE ot_id = p_ot_id AND lot_id = p_lot_id AND status = 'activa';
    ELSE
      UPDATE inventory_reservations
         SET quantity = quantity - p_quantity
       WHERE ot_id = p_ot_id AND lot_id = p_lot_id AND status = 'activa';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tx_id', v_tx_id,
    'lot_number', v_lot.lot_number, 'material', v_item.name, 'ot_number', v_ot.ot_number,
    'quantity', p_quantity, 'unit', v_unidad, 'unit_cost', COALESCE(v_lot.unit_cost, 0),
    'remaining', COALESCE(v_lot.quantity_available, 0) - p_quantity,
    'reserved_before', v_propia, 'cert_expires', v_lot.certification_expires_on, 'override', v_desvio
  );
END;
$$;

-- ── 6. Recibir una OC: el material entra a bodega (y se reserva), no a la OT ─
CREATE OR REPLACE FUNCTION public.receive_oc_into_lot(
  p_purchase_id UUID, p_item_id UUID, p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL, p_lot_number TEXT DEFAULT NULL,
  p_cert_code TEXT DEFAULT NULL, p_cert_expires DATE DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL, p_variance_reason TEXT DEFAULT NULL,
  p_cert_override_reason TEXT DEFAULT NULL
) RETURNS UUID
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
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

  -- FSSC 22000: material sin certificado vigente no entra a producción sin
  -- autorización nominal.
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
  -- disponibilidad (trg_sync_inventory_lot_quantities).
  INSERT INTO public.inventory_lots (
    item_id, lot_number, purchase_id, supplier_name, received_date,
    unit_cost, oc_unit_cost, quantity_received, quantity_available,
    certification_code, certification_expires_on,
    received_by, variance_reason, cert_override_by, cert_override_reason
  ) VALUES (
    p_item_id, v_lot_number, p_purchase_id, v_p.supplier, CURRENT_DATE,
    COALESCE(p_unit_cost, 0), COALESCE(p_unit_cost, 0), p_quantity, 0,
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

  -- Ya NO se asienta costo en la OT: recibir no es consumir. Antes esto
  -- insertaba en ot_real_costs ('oc_receipt') y la OT cargaba el papel
  -- comprado aunque no se usara, y otra vez al facturar. Lo que se compró
  -- PARA una OT queda reservado para ella: nadie más lo toma, y el backflush
  -- de esa OT lo prefiere. Cuesta cuando sale.
  IF v_p.ot_id IS NOT NULL THEN
    INSERT INTO public.inventory_reservations (lot_id, ot_id, quantity, status, expires_at, created_by)
    VALUES (v_lot_id, v_p.ot_id, p_quantity, 'activa', now() + interval '90 days', p_recorded_by);
  END IF;

  UPDATE public.purchases
     SET status = 'received', updated_at = now()
   WHERE id = p_purchase_id AND status = 'sent';

  PERFORM public.sync_purchase_ledger(p_purchase_id);

  RETURN v_lot_id;
END;
$$;

COMMENT ON FUNCTION public.receive_oc_into_lot(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT, TEXT) IS
  'Recibe material de una OC emitida: lote con trazabilidad FSSC, bloqueo por certificado vencido salvo autorización nominal, movimiento de stock, y reserva para la OT si la OC cuelga de una. No costea la OT: eso pasa al consumir (20261110120000).';

-- ── 7. La OC compromete; la factura corrige el precio del lote ─────────────
CREATE OR REPLACE FUNCTION public.sync_purchase_ledger(p_purchase_id UUID) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      public.purchases%ROWTYPE;
  v_net    NUMERIC;
  v_factor NUMERIC;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id;
  IF v_p.id IS NULL THEN RETURN; END IF;

  DELETE FROM public.ot_cost_lines WHERE ref_type = 'oc' AND ref_id = p_purchase_id;

  -- La factura conciliada es el precio REAL del material. Corrige los lotes
  -- de esta OC (tengan o no OT) y, por el trigger, cada consumo ya hecho de
  -- ellos. El neto, porque la OC se emite neta: el IVA es crédito fiscal, no
  -- costo del trabajo.
  SELECT COALESCE(net, amount) INTO v_net
    FROM public.purchase_invoices
   WHERE purchase_id = p_purchase_id AND status IN ('matched', 'paid')
   ORDER BY matched_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_net IS NOT NULL AND COALESCE(v_p.total_cost, 0) > 0 THEN
    v_factor := v_net / v_p.total_cost;
    UPDATE public.inventory_lots
       SET unit_cost = round(oc_unit_cost * v_factor, 4)
     WHERE purchase_id = p_purchase_id
       AND oc_unit_cost IS NOT NULL
       AND unit_cost IS DISTINCT FROM round(oc_unit_cost * v_factor, 4);
    UPDATE public.inventory_stock_transactions t
       SET unit_cost = l.unit_cost
      FROM public.inventory_lots l
     WHERE l.id = t.lot_id AND l.purchase_id = p_purchase_id
       AND t.unit_cost IS DISTINCT FROM l.unit_cost;
  END IF;

  -- Una OC emitida y no recibida es plata comprometida para su OT: se ve en el
  -- carril 'committed', no en el real. Al recibirse pasa a bodega y deja de
  -- estar comprometida; a la OT llega cuando se consume.
  IF v_p.ot_id IS NOT NULL AND v_p.status = 'sent' THEN
    INSERT INTO public.ot_cost_lines
      (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
    VALUES
      (v_p.ot_id, 'committed', 'material', 'purchase',
       COALESCE(v_p.oc_number, 'OC') || ' — ' || COALESCE(v_p.supplier, ''),
       1, 'OC', COALESCE(v_p.total_cost, 0), 'oc', p_purchase_id, now());
  END IF;
END;
$$;

-- ── 8. apply_capture_event: el parte aporta cantidades, no material ────────
CREATE OR REPLACE FUNCTION public.apply_capture_event(p_event_id UUID, p_actor UUID DEFAULT NULL) RETURNS UUID
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_e        public.capture_events%ROWTYPE;
  v_by       UUID;
  v_user     UUID;
  v_legacy   BOOLEAN := false;
  v_costs    JSONB;
  v_line     JSONB;
  v_ref      TEXT;
  v_origin   TEXT;
  v_tx_type  public.inventory_tx_type;
  v_lot_id   UUID;
  v_tx_id    UUID;
  v_supplier TEXT;
  v_consumo  JSONB;
BEGIN
  SELECT * INTO v_e FROM public.capture_events WHERE id = p_event_id FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Captura no encontrada: %', p_event_id; END IF;
  IF v_e.status NOT IN ('approved', 'auto_approved') THEN
    RAISE EXCEPTION 'La captura debe estar aprobada antes de aplicarse (estado: %)', v_e.status;
  END IF;

  IF v_e.legacy_table = 'whatsapp_production_logs' THEN
    SELECT fed_to_system INTO v_legacy FROM public.whatsapp_production_logs WHERE id = v_e.legacy_id FOR UPDATE;
  ELSIF v_e.legacy_table = 'whatsapp_warehouse_logs' THEN
    SELECT fed_to_inventory, supplier_name INTO v_legacy, v_supplier
      FROM public.whatsapp_warehouse_logs WHERE id = v_e.legacy_id FOR UPDATE;
  END IF;
  IF v_e.applied OR COALESCE(v_legacy, false) THEN
    RAISE EXCEPTION 'La captura ya fue aplicada';
  END IF;

  v_by := COALESCE(p_actor, v_e.reviewed_by);
  SELECT id INTO v_user FROM auth.users WHERE id = v_by;

  v_ref    := LEFT(COALESCE(v_e.legacy_id, v_e.id)::TEXT, 8);
  v_origin := CASE v_e.channel::TEXT WHEN 'whatsapp' THEN 'WhatsApp' ELSE 'captura' END;

  IF v_e.domain = 'production' THEN
    IF v_e.ot_id IS NULL THEN RAISE EXCEPTION 'La captura no tiene OT: no hay a dónde cargar el costo'; END IF;
    v_costs := COALESCE(v_e.corrected_costs, v_e.inferred_costs, '{}'::jsonb);

    -- Ni material ni máquina. El papel y la tinta entran cuando salen de
    -- bodega, al costo de su lote; la máquina, cuando se cierra la pasada
    -- (horas, o clics en digital) — y el parte ya alimenta esa pasada con sus
    -- horas y pliegos. Una línea acá los contaría otra vez y a otro precio. Las
    -- capturas viejas que todavía traen esas líneas se aplican sin ellas.
    -- Un parte sin líneas es válido: su valor es la cantidad y el avance.
    IF jsonb_typeof(v_costs->'cost_lines') = 'array' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(v_costs->'cost_lines') LOOP
        CONTINUE WHEN public.map_real_cost_category(COALESCE(v_line->>'category', 'otros')) IN ('material', 'machine');
        INSERT INTO public.ot_real_costs
          (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, recorded_by, notes)
        VALUES (
          v_e.ot_id, 'whatsapp_report', 'WA-' || v_ref,
          v_line->>'description', COALESCE(v_line->>'category', 'otros'),
          COALESCE((v_line->>'quantity')::NUMERIC, 0), COALESCE(v_line->>'unit', 'unit'),
          COALESCE((v_line->>'unit_cost')::NUMERIC, 0), v_user,
          'Registrado vía ' || v_origin || ' por ' || COALESCE(v_e.operator_name, v_e.operator_phone, 'operario')
        );
      END LOOP;
    END IF;

    IF v_e.legacy_table = 'whatsapp_production_logs' THEN
      UPDATE public.whatsapp_production_logs SET fed_to_system = true, updated_at = now() WHERE id = v_e.legacy_id;
    END IF;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'real_cost', updated_at = now()
     WHERE id = p_event_id;
    RETURN p_event_id;

  ELSIF v_e.domain = 'warehouse' THEN
    IF v_e.item_id IS NULL AND v_e.lot_id IS NULL THEN RAISE EXCEPTION 'Captura sin material vinculado'; END IF;
    CASE v_e.event_type
      WHEN 'receive' THEN v_tx_type := 'purchase';
      WHEN 'use'     THEN v_tx_type := 'consumption';
      WHEN 'return'  THEN v_tx_type := 'return_to_stock';
      ELSE
        -- El escaneo QR de un lote siempre es un consumo.
        IF v_e.channel::TEXT = 'qr' THEN v_tx_type := 'consumption';
        ELSE RAISE EXCEPTION 'Acción % no se puede aplicar a inventario', v_e.event_type; END IF;
    END CASE;
    IF v_e.quantity IS NULL OR v_e.quantity <= 0 THEN RAISE EXCEPTION 'Cantidad inválida — corregila antes de aprobar.'; END IF;
    IF v_e.channel::TEXT = 'qr' AND v_e.ot_id IS NULL THEN
      RAISE EXCEPTION 'Falta la OT — corregila antes de aprobar.';
    END IF;

    -- Consumo contra una OT: SIEMPRE por consumir_lote, venga de un QR, una
    -- foto o un WhatsApp. Antes la rama sin QR insertaba el consumo directo,
    -- sin retención, saldo, reserva ni certificado, y tomaba el lote MÁS
    -- NUEVO; el backflush toma el más viejo. Ahora: el lote que se nombró, o
    -- el reservado para esta OT, o el más viejo con saldo — la misma regla
    -- que backflush.
    IF v_tx_type = 'consumption' AND v_e.ot_id IS NOT NULL THEN
      v_lot_id := v_e.lot_id;
      IF v_lot_id IS NULL THEN
        SELECT l.id INTO v_lot_id
          FROM public.inventory_lots l
          LEFT JOIN public.inventory_reservations r
            ON r.lot_id = l.id AND r.ot_id = v_e.ot_id AND r.status = 'activa' AND r.expires_at > now()
         WHERE l.item_id = v_e.item_id AND l.quantity_available > 0 AND l.blocked_reason IS NULL
         ORDER BY (r.id IS NULL), l.received_date ASC, l.created_at ASC
         LIMIT 1;
      END IF;
      IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay un lote con saldo de ese material. Recibilo en bodega primero.'; END IF;

      v_consumo := public.consumir_lote(v_lot_id, v_e.ot_id, v_e.quantity, v_user,
                     CASE WHEN v_e.channel::TEXT = 'qr' THEN 'foto_bodega' ELSE 'captura_' || v_e.channel::TEXT END, NULL);
      v_tx_id := (v_consumo->>'tx_id')::UUID;
    ELSE
      v_lot_id := v_e.lot_id;
      IF v_lot_id IS NULL THEN
        SELECT id INTO v_lot_id FROM public.inventory_lots
         WHERE item_id = v_e.item_id AND quantity_available > 0
         ORDER BY received_date ASC, created_at ASC LIMIT 1;
      END IF;
      IF v_lot_id IS NULL AND v_tx_type = 'purchase' THEN
        INSERT INTO public.inventory_lots
          (item_id, lot_number, purchase_id, supplier_name, received_date, unit_cost, oc_unit_cost, quantity_received, quantity_available)
        VALUES (v_e.item_id, 'WA-' || to_char(now(), 'YYYYMMDD-HH24MI'), v_e.purchase_id, v_supplier, CURRENT_DATE,
                COALESCE(v_e.unit_cost, 0), COALESCE(v_e.unit_cost, 0), v_e.quantity, v_e.quantity)
        RETURNING id INTO v_lot_id;
      END IF;
      IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No hay lote para el material %. Creá un lote primero.', v_e.item_id; END IF;

      -- Una devolución con OT acredita a esa OT al costo de su lote (trigger);
      -- un consumo sin OT es gasto general de bodega y no toca ninguna OT.
      INSERT INTO public.inventory_stock_transactions
        (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_by)
      SELECT l.item_id, l.id, v_e.ot_id, v_tx_type, v_e.quantity,
             CASE WHEN v_tx_type = 'purchase' THEN COALESCE(v_e.unit_cost, l.unit_cost) ELSE l.unit_cost END,
             CASE WHEN v_e.legacy_id IS NOT NULL THEN 'WA-WH-' || v_e.legacy_id::TEXT ELSE 'CAP-' || v_e.id::TEXT END,
             COALESCE(v_e.review_comments, 'Vía ' || v_origin || ' bodega'), v_user
        FROM public.inventory_lots l WHERE l.id = v_lot_id
      RETURNING id INTO v_tx_id;
    END IF;

    IF v_e.legacy_table = 'whatsapp_warehouse_logs' THEN
      UPDATE public.whatsapp_warehouse_logs
         SET fed_to_inventory = true, inventory_tx_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
       WHERE id = v_e.legacy_id;
    END IF;
    UPDATE public.capture_events
       SET applied = true, applied_ref_type = 'inventory_tx', applied_ref_id = v_tx_id, lot_id = v_lot_id, updated_at = now()
     WHERE id = p_event_id;
    RETURN v_tx_id;

  ELSE
    RAISE EXCEPTION 'Dominio % no soportado', v_e.domain;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_capture_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_capture_event(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.cost_ot_material_movement() FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza. Todo lo que hay hoy es siembra de prueba (dueño, 2026-11-05), así
-- que se re-deriva el material de cada OT desde sus consumos reales.
-- ════════════════════════════════════════════════════════════════════════════

-- a. Material y máquina escritos a mano, por el diálogo (la cotización
--    copiada), por la recepción de OC y por los partes. El trigger de borrado
--    saca su espejo del libro.
DELETE FROM public.ot_real_costs WHERE public.map_real_cost_category(category) IN ('material', 'machine');

-- b. La siembra ponía un «Papel consumido» por OT, tasado aparte, al lado de
--    un consumo de lote real para la misma OT que nunca se enlazó.
DELETE FROM public.ot_cost_lines
 WHERE kind = 'actual' AND category = 'material' AND ref_type IS NULL
   AND source = 'system' AND description LIKE 'Papel consumido%';

-- c. Enlazar esos consumos a su OT (el número sólo estaba en la nota).
UPDATE public.inventory_stock_transactions t
   SET work_order_id = o.id
  FROM public.ots o
 WHERE t.work_order_id IS NULL AND t.tx_type = 'consumption'
   AND o.ot_number = substring(t.notes FROM 'OT (\d+)');

-- d. Costear todo consumo con OT que todavía no tenga su línea.
UPDATE public.inventory_stock_transactions t
   SET unit_cost = COALESCE(t.unit_cost, 0)
 WHERE t.work_order_id IS NOT NULL AND t.tx_type IN ('consumption', 'return_to_stock')
   AND NOT EXISTS (SELECT 1 FROM public.ot_cost_lines c WHERE c.ref_type = 'inventory_tx' AND c.ref_id = t.id);
-- (Asignar el mismo valor basta: UPDATE OF dispara por columna nombrada en el
--  SET, cambie o no el valor.)

-- e. Re-sincronizar cada OC: compromete sólo las emitidas sin recibir, y las
--    facturadas re-tasan sus lotes y los consumos de ellos.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.purchases LOOP
    PERFORM public.sync_purchase_ledger(r.id);
  END LOOP;
END;
$$;

-- f. Lo comprado para una OT y todavía en bodega queda reservado para ella.
INSERT INTO public.inventory_reservations (lot_id, ot_id, quantity, status, expires_at)
SELECT l.id, p.ot_id, l.quantity_available, 'activa', now() + interval '90 days'
  FROM public.inventory_lots l
  JOIN public.purchases p ON p.id = l.purchase_id
 WHERE p.ot_id IS NOT NULL AND l.quantity_available > 0
   AND NOT EXISTS (SELECT 1 FROM public.inventory_reservations r
                    WHERE r.lot_id = l.id AND r.ot_id = p.ot_id AND r.status = 'activa');

-- ════════════════════════════════════════════════════════════════════════════
-- Completar la siembra (dueño, 2026-11-10: «son de una siembra anterior,
-- completá los datos»). Que cada OT tenga lo que la regla exige: la máquina en
-- pasadas, el papel y la tinta en consumos de lote. Las cantidades que faltan
-- salen de la ficha de la OT (es siembra: no hay otra fuente); los precios, de
-- los lotes.
-- ════════════════════════════════════════════════════════════════════════════

-- g. Las horas de prensa de la siembra pasan a ser lo que debieron ser: la
--    pasada de impresión, cerrada cuando la historia dice que la OT salió de
--    offset. stage-valuation.ts las valoriza (scripts/value-stage-passes.mts).
INSERT INTO public.ot_stage_reports (ot_id, workflow_step, to_status, hours, units_moved, machine_id, observations, created_at)
SELECT l.ot_id, 'offset_printing', h.to_status, round(l.quantity, 2), NULLIF(o.quantity, 0), m.id,
       'Siembra completada: horas de prensa de la siembra, registradas como pasada.', h.created_at
  FROM public.ot_cost_lines l
  JOIN public.ots o ON o.id = l.ot_id
  JOIN LATERAL (SELECT to_status, created_at FROM public.ot_status_history
                 WHERE ot_id = l.ot_id AND from_status = 'offset_printing'
                 ORDER BY created_at LIMIT 1) h ON true
  LEFT JOIN public.machines m ON m.name = split_part(l.description, ' — ', 2)
 WHERE l.kind = 'actual' AND l.category = 'machine' AND l.source = 'system' AND l.ref_type IS NULL
   AND l.description LIKE 'Hora de prensa — %'
   AND NOT EXISTS (SELECT 1 FROM public.ot_stage_reports s WHERE s.ot_id = l.ot_id AND s.workflow_step = 'offset_printing');

-- h. Ninguna máquina real sin su pasada (lo convertido arriba, lo copiado de la
--    cotización y lo manual).
DELETE FROM public.ot_cost_lines
 WHERE kind = 'actual' AND category = 'machine' AND COALESCE(ref_type, '') <> 'stage_pass' AND source <> 'seed';

-- i. Lo comprado para una OT, del papel que la OT lleva. OC-00021 compraba
--    «Couche 200 g» para una OT de adhesivo 90 g. Sólo lotes todavía sin
--    consumir: re-etiquetar uno ya usado cambiaría el papel de otro trabajo.
UPDATE public.inventory_lots l
   SET item_id = t.item_id
  FROM (
    SELECT l2.id AS lot_id,
           (SELECT i.id FROM public.inventory_items i
             WHERE i.category = 'product_input' AND i.is_active
               AND i.grammage_gsm = o.grammage_gsm
               AND i.name ILIKE '%' || left(o.substrate_type::text, 5) || '%'
             ORDER BY i.name LIMIT 1) AS item_id
      FROM public.inventory_lots l2
      JOIN public.purchases p ON p.id = l2.purchase_id
      JOIN public.ots o ON o.id = p.ot_id
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_stock_transactions t
                        WHERE t.lot_id = l2.id AND t.tx_type <> 'purchase')
  ) t
 WHERE l.id = t.lot_id AND t.item_id IS NOT NULL AND l.item_id <> t.item_id;
UPDATE public.inventory_stock_transactions tx
   SET item_id = l.item_id
  FROM public.inventory_lots l
 WHERE l.id = tx.lot_id AND tx.item_id <> l.item_id;

-- j. Papel: cada OT que salió de una etapa de papel sin consumo registrado.
--    De su lote reservado primero, después del más viejo con saldo libre, y si
--    no alcanza, de un lote de siembra. Un fragmento consume contra su padre
--    (como sus pasadas), en proporción a sus unidades.
DO $$
DECLARE
  r       RECORD;
  v_item  public.inventory_items%ROWTYPE;
  v_lot   public.inventory_lots%ROWTYPE;
  v_need  NUMERIC;
  v_take  NUMERIC;
BEGIN
  FOR r IN
    SELECT o.id, o.ot_number, o.substrate_type::text AS substrate, o.grammage_gsm, h.from_status, h.created_at,
           COALESCE((SELECT p.id FROM public.ots p
                      WHERE p.split_group_id = o.split_group_id AND p.ot_number = split_part(o.ot_number, '-', 1)), o.id) AS owner_id,
           round(o.calc_substrate_kg *
             CASE WHEN o.split_group_id IS NULL THEN 1
                  ELSE o.quantity::numeric / NULLIF((SELECT sum(g.quantity) FROM public.ots g WHERE g.split_group_id = o.split_group_id), 0)
             END, 2) AS need
      FROM public.ots o
      JOIN LATERAL (SELECT from_status, created_at FROM public.ot_status_history
                     WHERE ot_id = o.id AND from_status IN ('guillotine_first_cut', 'offset_printing', 'digital_printing')
                     ORDER BY created_at LIMIT 1) h ON true
     WHERE COALESCE(o.calc_substrate_kg, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM public.inventory_stock_transactions t
                        WHERE t.work_order_id = o.id AND t.tx_type = 'consumption')
  LOOP
    SELECT * INTO v_item FROM public.inventory_items i
     WHERE i.category = 'product_input' AND i.is_active AND i.grammage_gsm = r.grammage_gsm
       AND i.name ILIKE '%' || left(r.substrate, 5) || '%'
     ORDER BY i.name LIMIT 1;
    IF v_item.id IS NULL THEN
      RAISE NOTICE 'Siembra: % (%, % g) sin un papel del inventario que calce; queda sin consumo.', r.ot_number, r.substrate, r.grammage_gsm;
      CONTINUE;
    END IF;

    v_need := r.need;
    WHILE v_need > 0 LOOP
      v_lot := NULL;
      -- reservado para esta OT, después libre más viejo
      SELECT l.* INTO v_lot
        FROM public.inventory_lots l
        LEFT JOIN public.inventory_reservations rv
          ON rv.lot_id = l.id AND rv.ot_id = r.owner_id AND rv.status = 'activa'
       WHERE l.item_id = v_item.id AND l.blocked_reason IS NULL
         AND l.quantity_available - COALESCE((SELECT sum(x.quantity) FROM public.inventory_reservations x
                                               WHERE x.lot_id = l.id AND x.status = 'activa' AND x.expires_at > now()
                                                 AND x.ot_id <> r.owner_id), 0) > 0
       ORDER BY (rv.id IS NULL), l.received_date, l.created_at
       LIMIT 1;

      IF v_lot.id IS NULL THEN
        INSERT INTO public.inventory_lots (item_id, lot_number, supplier_name, received_date, unit_cost, oc_unit_cost,
                                           quantity_received, quantity_available, certification_code, certification_expires_on)
        VALUES (v_item.id, 'SIEMBRA-' || r.ot_number, 'Siembra — papel', (r.created_at - interval '7 days')::date,
                COALESCE(v_item.estimated_unit_cost, 0), COALESCE(v_item.estimated_unit_cost, 0),
                v_need, 0, 'FSSC-SIEMBRA', DATE '2027-12-31')
        RETURNING * INTO v_lot;
        INSERT INTO public.inventory_stock_transactions (item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes, created_at)
        VALUES (v_item.id, v_lot.id, 'purchase', v_need, v_lot.unit_cost, v_lot.lot_number, 'Siembra completada: papel para ' || r.ot_number, r.created_at - interval '7 days');
        SELECT * INTO v_lot FROM public.inventory_lots WHERE id = v_lot.id;
      END IF;

      v_take := LEAST(v_need, v_lot.quantity_available - COALESCE((SELECT sum(x.quantity) FROM public.inventory_reservations x
                                 WHERE x.lot_id = v_lot.id AND x.status = 'activa' AND x.expires_at > now()
                                   AND x.ot_id <> r.owner_id), 0));
      EXIT WHEN v_take IS NULL OR v_take <= 0;
      INSERT INTO public.inventory_stock_transactions (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_at)
      VALUES (v_item.id, v_lot.id, r.owner_id, 'consumption', v_take, v_lot.unit_cost, v_lot.lot_number,
              r.from_status || ' · siembra completada (' || r.ot_number || ')', r.created_at);
      UPDATE public.inventory_reservations
         SET quantity = GREATEST(quantity - v_take, 0),
             status = CASE WHEN quantity - v_take <= 0 THEN 'consumida' ELSE status END,
             released_at = CASE WHEN quantity - v_take <= 0 THEN now() ELSE released_at END
       WHERE lot_id = v_lot.id AND ot_id = r.owner_id AND status = 'activa';
      v_need := v_need - v_take;
    END LOOP;
  END LOOP;
END;
$$;

-- k. Tinta: por kg, de su lote. Cada OT que salió de offset consume su tinta
--    (la de la ficha) repartida entre los colores que lleva, contra un lote
--    por tinta recibido en abril. CMYK → C, M, Y, K; con Pantone suma el 485C;
--    1 color → negro; 2 colores → negro + 300C.
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_lots WHERE lot_number LIKE 'SIEMBRA-TINTA-%') THEN RETURN; END IF;

  CREATE TEMP TABLE _uso_tinta ON COMMIT DROP AS
  WITH printed AS (
    SELECT o.id, o.ot_number, o.calc_ink_kg, h.created_at,
           o.color_front::text AS cf, o.color_back::text AS cb,
           COALESCE((SELECT p.id FROM public.ots p
                      WHERE p.split_group_id = o.split_group_id AND p.ot_number = split_part(o.ot_number, '-', 1)), o.id) AS owner_id,
           CASE WHEN o.split_group_id IS NULL THEN 1
                ELSE o.quantity::numeric / NULLIF((SELECT sum(g.quantity) FROM public.ots g WHERE g.split_group_id = o.split_group_id), 0)
           END AS share
      FROM public.ots o
      JOIN LATERAL (SELECT created_at FROM public.ot_status_history
                     WHERE ot_id = o.id AND from_status = 'offset_printing'
                     ORDER BY created_at LIMIT 1) h ON true
     WHERE COALESCE(o.calc_ink_kg, 0) > 0
  ), colores AS (
    SELECT p.*, unnest(CASE
      WHEN 'cmyk_pantone' IN (p.cf, p.cb) THEN ARRAY['Tinta Cyan CMYK offset', 'Tinta Magenta CMYK offset', 'Tinta Yellow CMYK offset', 'Tinta Black CMYK offset', 'Tinta Pantone 485C (rojo)']
      WHEN 'cmyk' IN (p.cf, p.cb)         THEN ARRAY['Tinta Cyan CMYK offset', 'Tinta Magenta CMYK offset', 'Tinta Yellow CMYK offset', 'Tinta Black CMYK offset']
      WHEN '2_color' IN (p.cf, p.cb)      THEN ARRAY['Tinta Black CMYK offset', 'Tinta Pantone 300C (azul)']
      WHEN '1_color' IN (p.cf, p.cb)      THEN ARRAY['Tinta Black CMYK offset']
      ELSE ARRAY[]::text[] END) AS tinta
      FROM printed p
  )
  SELECT c.owner_id, c.ot_number, c.created_at, i.id AS item_id,
         round(c.calc_ink_kg * c.share / count(*) OVER (PARTITION BY c.id), 3) AS kg
    FROM colores c JOIN public.inventory_items i ON i.name = c.tinta AND i.category = 'product_input';

  FOR r IN SELECT item_id, sum(kg) AS total FROM _uso_tinta GROUP BY item_id LOOP
    WITH lote AS (
      INSERT INTO public.inventory_lots (item_id, lot_number, supplier_name, received_date, unit_cost, oc_unit_cost,
                                         quantity_received, quantity_available, certification_code, certification_expires_on)
      SELECT r.item_id, 'SIEMBRA-TINTA-' || upper(substr(md5(r.item_id::text), 1, 6)), 'Siembra — tintas', DATE '2026-04-01',
             i.estimated_unit_cost, i.estimated_unit_cost, ceil(r.total * 1.15) + 20, 0, 'FSSC-TINTA-2026', DATE '2027-12-31'
        FROM public.inventory_items i WHERE i.id = r.item_id
      RETURNING id, item_id, unit_cost, quantity_received, lot_number
    )
    INSERT INTO public.inventory_stock_transactions (item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes, created_at)
    SELECT item_id, id, 'purchase', quantity_received, unit_cost, lot_number, 'Siembra completada: tinta', TIMESTAMPTZ '2026-04-01 12:00-04'
      FROM lote;
  END LOOP;

  INSERT INTO public.inventory_stock_transactions (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost, reference_code, notes, created_at)
  SELECT u.item_id, l.id, u.owner_id, 'consumption', u.kg, l.unit_cost, l.lot_number,
         'offset_printing · siembra completada (' || u.ot_number || ')', u.created_at
    FROM _uso_tinta u
    JOIN public.inventory_lots l ON l.item_id = u.item_id AND l.lot_number LIKE 'SIEMBRA-TINTA-%'
   WHERE u.kg > 0;
END;
$$;

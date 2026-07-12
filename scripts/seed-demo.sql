-- ============================================================
-- DEMO SEED — "Viña Santa Elena" story (plan §3.5)
--
-- One coherent client narrative, all dates relative to now(), designed to
-- walk the golden thread live in a demo:
--
--   1. VB-09001 SIGNED and unconverted → the presenter clicks "Convertir"
--      live and mints the next correlative OT on stage.
--   2. The STAR OT (etiqueta Carmenère) mid-production: machine assigned,
--      real status history, an OC received into a PEFC-certified lot via the
--      real receive_oc_into_lot() RPC (lot + stock + auto real-cost, exactly
--      as production does it), an open WhatsApp session from this morning
--      and a pending END review to approve live.
--   3. A COMPLETED OT (etiqueta Sauvignon) with consumption, approval,
--      dispatch guide and a paid invoice — the full FSSC dossier + money arc.
--
-- Idempotent: everything is tagged '[DEMO]' (notes) / DEMO- prefixes and
-- wiped before re-inserting, so the script can re-run for a fresh demo day.
-- Run AFTER migrations 20260713120000/121000 (purge + backfill).
--
-- POST-STEP (photo evidence — storage can't be seeded from SQL): after each
-- run, give the completed OT its deliverable photo so the dossier reads
-- COMPLIANT. Easiest: the WhatsApp simulator on /operaciones/whatsapp with a
-- photo URL, or drag an image onto the OT's attachments. ~30 seconds.
-- ============================================================

BEGIN;

-- ─── 0. Wipe any previous demo story ─────────────────────────
DO $$
DECLARE
  v_demo_ots UUID[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO v_demo_ots
  FROM public.ots WHERE notes LIKE '[DEMO]%';

  DELETE FROM public.whatsapp_production_logs
   WHERE ot_id = ANY(v_demo_ots) AND start_log_id IS NOT NULL;
  DELETE FROM public.whatsapp_production_logs WHERE ot_id = ANY(v_demo_ots);
  DELETE FROM public.sales_invoices    WHERE ot_id = ANY(v_demo_ots);
  DELETE FROM public.dispatch_guides   WHERE ot_id = ANY(v_demo_ots);
  DELETE FROM public.ot_approvals      WHERE ot_id = ANY(v_demo_ots);
  DELETE FROM public.ot_machine_schedule WHERE ot_id = ANY(v_demo_ots);

  DELETE FROM public.inventory_stock_transactions
   WHERE lot_id IN (SELECT l.id FROM public.inventory_lots l
                    JOIN public.purchases p ON p.id = l.purchase_id
                    WHERE p.notes LIKE '[DEMO]%');
  DELETE FROM public.inventory_lots
   WHERE purchase_id IN (SELECT id FROM public.purchases WHERE notes LIKE '[DEMO]%');
  DELETE FROM public.ot_cost_lines
   WHERE ref_type = 'oc'
     AND ref_id IN (SELECT id FROM public.purchases WHERE notes LIKE '[DEMO]%');
  DELETE FROM public.purchases WHERE notes LIKE '[DEMO]%';

  DELETE FROM public.ots WHERE id = ANY(v_demo_ots);
  DELETE FROM public.vistos_buenos WHERE notes LIKE '[DEMO]%' AND status <> 'converted';
END $$;

-- ─── Shared context ──────────────────────────────────────────
DO $$
DECLARE
  v_client_id   UUID;
  v_item_id     UUID;
  v_machine_id  UUID;
  v_operator    RECORD;
  v_star_ot     UUID;
  v_done_ot     UUID;
  v_star_num    TEXT;
  v_done_num    TEXT;
  v_oc_star     UUID;
  v_oc_done     UUID;
  v_lot_done    UUID;
  v_start_log   UUID;
  v_guide_id    UUID;
BEGIN
  -- 1. Client (find-or-create by RUT)
  SELECT id INTO v_client_id FROM public.clients WHERE rut = '76.543.210-K';
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, rut, contact_name, phone, email, payment_terms)
    VALUES ('Viña Santa Elena SpA', '76.543.210-K', 'Carolina Reyes',
            '+56 9 8765 4321', 'creyes@santaelena.cl', '30 días')
    RETURNING id INTO v_client_id;
  END IF;

  -- 2. Certified-material item (cert_required → Certificaciones shows the dimension)
  SELECT id INTO v_item_id FROM public.inventory_items WHERE sku = 'DEMO-ADH-090';
  IF v_item_id IS NULL THEN
    INSERT INTO public.inventory_items
      (sku, name, category, unit, min_stock, estimated_unit_cost, is_certification_required, notes)
    VALUES ('DEMO-ADH-090', 'Adhesivo blanco PEFC 90grs', 'product_input', 'kg', 100, 3500, true,
            '[DEMO] Material certificado de la historia Viña Santa Elena')
    RETURNING id INTO v_item_id;
  END IF;

  -- 3. An offset press (best-effort: any machine if no offset one exists)
  SELECT id INTO v_machine_id FROM public.machines
   WHERE type::text ILIKE '%offset%' ORDER BY name LIMIT 1;
  IF v_machine_id IS NULL THEN
    SELECT id INTO v_machine_id FROM public.machines ORDER BY name LIMIT 1;
  END IF;

  -- 4. A real operator for the WhatsApp arc
  SELECT id, full_name, phone INTO v_operator FROM public.employees
   WHERE phone IS NOT NULL ORDER BY full_name LIMIT 1;

  -- ─── ARC 1: signed VB, ready to convert on stage ───────────
  IF NOT EXISTS (SELECT 1 FROM public.vistos_buenos WHERE vb_number = 'VB-09001') THEN
    INSERT INTO public.vistos_buenos
      (vb_number, client_id, client_name, product_name, product_type, quantity,
       width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
       estimate_lines, subtotal_cost, margin_pct, total_price, unit_price,
       status, signed_at, signed_by_name, valid_until, notes)
    VALUES
      ('VB-09001', v_client_id, 'Viña Santa Elena SpA',
       'Etiqueta Reserva Carmenère 750ml', 'etiqueta', 120000,
       9.5, 12.0, 'adhesivo', 90, '4', '0',
       '[{"category":"material","description":"Adhesivo PEFC 90grs","quantity":420,"unit":"kg","unit_cost":3500},
         {"category":"machine","description":"Impresión Offset 4 colores","quantity":9,"unit":"hrs","unit_cost":85000},
         {"category":"finishing","description":"Troquelado y embalado","quantity":6,"unit":"hrs","unit_cost":25000}]'::jsonb,
       2385000, 38, 3800000, 31.67,
       'signed', now() - interval '1 day', 'Carolina Reyes',
       (now() + interval '20 days')::date,
       '[DEMO] Firmado ayer — convertir en vivo durante la demo');
  END IF;

  -- ─── ARC 2: the star OT, mid-production ────────────────────
  v_star_num := public.generate_ot_number();
  INSERT INTO public.ots
    (ot_number, client_id, client_name, product_name, product_type, description,
     quantity, priority, priority_level, deadline, status, assigned_machine_id,
     width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
     subtotal, margin_pct, total_price, unit_price, created_at, updated_at, notes)
  VALUES
    (v_star_num, v_client_id, 'Viña Santa Elena SpA',
     'Etiqueta Gran Reserva Cabernet 750ml', 'etiqueta',
     'Etiqueta autoadhesiva premium, 4/0 + barniz, lote de exportación',
     150000, 8, 'alta', (now() + interval '6 days'),
     'offset_printing', v_machine_id,
     9.5, 12.0, 'adhesivo', 90, 'cmyk', 'sin_impresion',
     2900000, 38, 4620000, 30.8,
     now() - interval '5 days', now() - interval '1 day',
     '[DEMO] OT estrella — en prensa, con OC recibida y sesión WhatsApp activa')
  RETURNING id INTO v_star_ot;

  -- Estimate lines (cost-analysis compares these against the auto real cost)
  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order) VALUES
    (v_star_ot, 'materiales',    'Adhesivo blanco PEFC 90grs', 'kg',   850, 3500,  0),
    (v_star_ot, 'impresion',     'Impresión Offset 4 colores', 'hrs',   11, 85000, 1),
    (v_star_ot, 'terminaciones', 'Troquelado y embalado',      'hrs',    7, 25000, 2);

  -- Real status history (captured tier, not backfill-tagged)
  INSERT INTO public.ot_status_history
    (ot_id, from_status, to_status, changed_by_role, reason, metadata, created_at)
  VALUES
    (v_star_ot, NULL,            'pre_press',       'system',     '[DEMO] creación',        '{}'::jsonb, now() - interval '5 days'),
    (v_star_ot, 'pre_press',     'visto_bueno',     'supervisor', 'Arte aprobado por cliente', '{}'::jsonb, now() - interval '4 days'),
    (v_star_ot, 'visto_bueno',   'paper_purchase',  'supervisor', 'OC emitida a proveedor',    '{}'::jsonb, now() - interval '4 days' + interval '3 hours'),
    (v_star_ot, 'paper_purchase','in_storage',      'supervisor', 'Material recibido en bodega','{}'::jsonb, now() - interval '3 days'),
    (v_star_ot, 'in_storage',    'offset_printing', 'supervisor', 'Entra a prensa',            '{}'::jsonb, now() - interval '1 day');

  -- OC → certified lot → auto real cost, via the REAL production RPC
  INSERT INTO public.purchases
    (supplier, supplier_rut, ot_id, total_cost, status, purchase_date, notes)
  VALUES
    ('Papelera Andina S.A.', '90.123.000-5', v_star_ot, 2975000, 'sent',
     (now() - interval '4 days')::date,
     '[DEMO] Adhesivo PEFC para OT estrella')
  RETURNING id INTO v_oc_star;

  PERFORM public.receive_oc_into_lot(
    v_oc_star, v_item_id, 850, 3500,
    'PEFC-' || to_char(now(), 'YYMMDD') || '-CAB',
    'PEFC/29-31-92', (now() + interval '14 months')::date,
    NULL
  );

  -- WhatsApp arc: yesterday's completed pair (pending review) + today's open session
  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, review_status)
  VALUES
    (v_star_num, v_star_ot, COALESCE(v_operator.phone, '+56 9 5111 0005'),
     COALESCE(v_operator.full_name, 'Operador Demo'), v_operator.id,
     'start', 'inicio ' || v_star_num,
     now() - interval '1 day' - interval '7 hours', 'auto_approved')
  RETURNING id INTO v_start_log;

  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp,
     parsed_data, inferred_costs, start_log_id, elapsed_minutes, review_status)
  VALUES
    (v_star_num, v_star_ot, COALESCE(v_operator.phone, '+56 9 5111 0005'),
     COALESCE(v_operator.full_name, 'Operador Demo'), v_operator.id,
     'end',
     'Fin ' || v_star_num || ', 62.000 pliegos, 900 de merma, offset 4 colores ok',
     now() - interval '1 day',
     jsonb_build_object(
       'pliegos_produced', 62000, 'merma', 900, 'buenos', 61100,
       'processes_mentioned', jsonb_build_array('offset'),
       'machine_mentioned', 'offset_4_colores', 'paper_mentioned', 'adhesivo 90 grs',
       'colors_mentioned', '4/0', 'problems_reported', jsonb_build_array(),
       'unparsed_notes', '', 'confidence', 85),
     jsonb_build_object(
       'lines', jsonb_build_array(
         jsonb_build_object('concept', 'Horas prensa (7,0 h estimadas por tiraje)', 'amount', 595000),
         jsonb_build_object('concept', 'Merma de sustrato (900 pliegos)', 'amount', 47250)),
       'total_inferred_cost', 642250),
     v_start_log, 420, 'pending');

  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, review_status)
  VALUES
    (v_star_num, v_star_ot, COALESCE(v_operator.phone, '+56 9 5111 0005'),
     COALESCE(v_operator.full_name, 'Operador Demo'), v_operator.id,
     'start', 'entro ' || v_star_num || ' segundo turno',
     now() - interval '2 hours', 'auto_approved');

  -- ─── ARC 3: completed OT with full dossier + money ─────────
  v_done_num := public.generate_ot_number();
  INSERT INTO public.ots
    (ot_number, client_id, client_name, product_name, product_type, description,
     quantity, priority, priority_level, deadline, status, assigned_machine_id,
     width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back,
     subtotal, margin_pct, total_price, unit_price,
     created_at, updated_at, completed_at, notes)
  VALUES
    (v_done_num, v_client_id, 'Viña Santa Elena SpA',
     'Etiqueta Sauvignon Blanc 750ml', 'etiqueta',
     'Etiqueta autoadhesiva 4/0, entregada y facturada',
     80000, 5, 'normal', (now() - interval '6 days'),
     'completed', v_machine_id,
     9.0, 11.0, 'adhesivo', 90, 'cmyk', 'sin_impresion',
     1650000, 38, 2620000, 32.75,
     now() - interval '18 days', now() - interval '7 days', now() - interval '7 days',
     '[DEMO] OT completada — dossier FSSC completo, despachada y pagada')
  RETURNING id INTO v_done_ot;

  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order) VALUES
    (v_done_ot, 'materiales',    'Adhesivo blanco PEFC 90grs', 'kg',  450, 3500,  0),
    (v_done_ot, 'impresion',     'Impresión Offset 4 colores', 'hrs',   6, 85000, 1),
    (v_done_ot, 'terminaciones', 'Troquelado y embalado',      'hrs',   4, 25000, 2);

  INSERT INTO public.ot_status_history
    (ot_id, from_status, to_status, changed_by_role, reason, metadata, created_at)
  VALUES
    (v_done_ot, NULL,              'pre_press',          'system',     '[DEMO] creación', '{}'::jsonb, now() - interval '18 days'),
    (v_done_ot, 'pre_press',       'visto_bueno',        'supervisor', 'Arte aprobado',   '{}'::jsonb, now() - interval '16 days'),
    (v_done_ot, 'visto_bueno',     'paper_purchase',     'supervisor', 'OC emitida',      '{}'::jsonb, now() - interval '15 days'),
    (v_done_ot, 'paper_purchase',  'in_storage',         'supervisor', 'Material en bodega','{}'::jsonb, now() - interval '13 days'),
    (v_done_ot, 'in_storage',      'offset_printing',    'supervisor', 'Entra a prensa',  '{}'::jsonb, now() - interval '11 days'),
    (v_done_ot, 'offset_printing', 'workshop',           'supervisor', 'A terminaciones', '{}'::jsonb, now() - interval '10 days'),
    (v_done_ot, 'workshop',        'ready_for_delivery', 'supervisor', 'Control de calidad OK','{}'::jsonb, now() - interval '8 days'),
    (v_done_ot, 'ready_for_delivery', 'in_delivery',     'supervisor', 'Despacho a cliente','{}'::jsonb, now() - interval '7 days' - interval '4 hours'),
    (v_done_ot, 'in_delivery',     'completed',          'supervisor', 'Entrega confirmada','{}'::jsonb, now() - interval '7 days');

  -- Its OC + certified lot (received while the OT was in paper_purchase)
  INSERT INTO public.purchases
    (supplier, supplier_rut, ot_id, total_cost, status, purchase_date, notes)
  VALUES
    ('Papelera Andina S.A.', '90.123.000-5', v_done_ot, 1575000, 'sent',
     (now() - interval '15 days')::date,
     '[DEMO] Adhesivo PEFC para OT completada')
  RETURNING id INTO v_oc_done;

  v_lot_done := public.receive_oc_into_lot(
    v_oc_done, v_item_id, 450, 3500,
    'PEFC-' || to_char(now() - interval '13 days', 'YYMMDD') || '-SAU',
    'PEFC/29-31-92', (now() + interval '14 months')::date,
    NULL
  );

  -- Consumption against the OT (the strong dossier tier): the trigger books
  -- it out of the lot, so availability ends at 0 — fully consumed.
  INSERT INTO public.inventory_stock_transactions
    (item_id, lot_id, tx_type, quantity, unit_cost, work_order_id, reference_code, notes)
  VALUES
    (v_item_id, v_lot_done, 'consumption', 450, 3500, v_done_ot, v_done_num,
     '[DEMO] Consumo en producción');

  -- Quality sign-off → dossier compliance
  INSERT INTO public.ot_approvals (ot_id, status, comments, resolved_at, created_at)
  VALUES (v_done_ot, 'approved',
          'Entregable revisado contra muestra firmada. Sin observaciones.',
          now() - interval '8 days', now() - interval '8 days');

  -- Dispatch + paid invoice (the money arc, dated to match the story)
  INSERT INTO public.dispatch_guides
    (guide_number, ot_id, client_id, client_name, quantity, dispatch_date,
     carrier, received_by, notes)
  VALUES ('GD-09001', v_done_ot, v_client_id, 'Viña Santa Elena SpA', 80000,
          (now() - interval '7 days')::date,
          'Transportes Del Valle', 'Carolina Reyes',
          '[DEMO] Despacho completo en un bulto')
  RETURNING id INTO v_guide_id;

  INSERT INTO public.sales_invoices
    (invoice_number, ot_id, client_id, client_name,
     net_amount, tax_amount, total_amount, status, issued_date, paid_date)
  VALUES ('FV-09001', v_done_ot, v_client_id, 'Viña Santa Elena SpA',
          2620000, 497800, 3117800, 'paid',
          (now() - interval '7 days')::date, (now() - interval '2 days')::date);

  -- ─── Housekeeping: de-2025 the shift names ─────────────────
  UPDATE public.shifts
     SET name = regexp_replace(name, '\s*[—-]\s*\d{1,2}\s+\w+\s+2025\s*$', '')
   WHERE name ~ '2025';

  RAISE NOTICE 'Demo story lista: VB-09001 (firmar→convertir en vivo), OT % (estrella en prensa), OT % (completada+facturada)', v_star_num, v_done_num;
END $$;

COMMIT;

-- ============================================================
-- SEED 13 — Procurement (OC → Factura → cost ledger), demo data
--
-- A few Órdenes de Compra tied to live OTs, in different billing states, so the
-- Compras tab and the OT cost ledger show the full procurement story:
--
--   OC sent (no factura)        → committed cost on the OT (on order)
--   OC received + factura match  → actual cost on the OT (hits real cost)
--   OC invoiced, factura pending → still committed (awaiting match)
--   stock OC (no OT)             → no OT charge (warehouse stock)
--
-- Run order: AFTER 20260629120000_procurement_oc_factura.sql and seed_09 (OTs).
-- Safe to re-run: YES (clears its own notes='seed_13_demo' rows + their ledger).
-- ============================================================

DO $$
DECLARE
  ot_500 UUID;  -- OT-40500 PackBrands  (pre_press)
  ot_497 UUID;  -- OT-40497 Comercial Norte (offset_printing)
  ot_498 UUID;  -- OT-40498 Express Retail  (die_cutting)
  oc_a UUID; oc_b UUID; oc_c UUID; oc_d UUID;
BEGIN
  SELECT id INTO ot_500 FROM public.ots WHERE ot_number = 'OT-40500' LIMIT 1;
  SELECT id INTO ot_497 FROM public.ots WHERE ot_number = 'OT-40497' LIMIT 1;
  SELECT id INTO ot_498 FROM public.ots WHERE ot_number = 'OT-40498' LIMIT 1;

  -- Idempotency: drop prior demo OCs' ledger lines, then the OCs (cascades facturas).
  DELETE FROM public.ot_cost_lines
   WHERE ref_type = 'oc'
     AND ref_id IN (SELECT id FROM public.purchases WHERE notes = 'seed_13_demo');
  DELETE FROM public.purchases WHERE notes = 'seed_13_demo';

  -- ── OC A — paper for OT-40500, sent (committed, no factura yet) ──
  INSERT INTO public.purchases (supplier, supplier_rut, purchase_date, expected_date, total_cost, status, ot_id, certification_details, notes)
  VALUES ('Papelera Andina S.A.', '90.123.000-5', current_date - 2, current_date + 3, 14500000, 'sent', ot_500,
          'Cartulina FSC 350g — certificado adjunto', 'seed_13_demo')
  RETURNING id INTO oc_a;

  -- ── OC B — substrate for OT-40497, received + factura MATCHED (actual cost) ──
  INSERT INTO public.purchases (supplier, supplier_rut, purchase_date, expected_date, total_cost, status, ot_id, certification_details, notes)
  VALUES ('Adhesivos del Pacífico Ltda.', '76.880.450-2', current_date - 9, current_date - 5, 8200000, 'received', ot_497,
          'Adhesivo PP blanco — lote certificado', 'seed_13_demo')
  RETURNING id INTO oc_b;

  INSERT INTO public.purchase_invoices (purchase_id, invoice_number, invoice_date, amount, status, matched_at, notes)
  VALUES (oc_b, 'F-88213', current_date - 4, 8200000, 'matched', now() - interval '2 days', 'Calza con la OC');

  -- ── OC C — ink for OT-40498, invoiced + factura PENDING (over by $300k) ──
  INSERT INTO public.purchases (supplier, supplier_rut, purchase_date, expected_date, total_cost, status, ot_id, certification_details, notes)
  VALUES ('Tintas Gráficas Sur SpA', '77.450.900-1', current_date - 6, current_date - 3, 3100000, 'invoiced', ot_498,
          'Tinta UV cian/magenta', 'seed_13_demo')
  RETURNING id INTO oc_c;

  INSERT INTO public.purchase_invoices (purchase_id, invoice_number, invoice_date, amount, status, notes)
  VALUES (oc_c, 'F-10477', current_date - 2, 3400000, 'disputed', 'Factura supera la OC en $300.000 — en revisión');

  -- ── OC D — stock paper (no OT), received (warehouse stock, no OT charge) ──
  INSERT INTO public.purchases (supplier, supplier_rut, purchase_date, total_cost, status, ot_id, certification_details, notes)
  VALUES ('Papelera Andina S.A.', '90.123.000-5', current_date - 1, 6000000, 'received', NULL,
          'Bond 90g stock general', 'seed_13_demo')
  RETURNING id INTO oc_d;

  -- Feed each OC into the cost ledger (committed/actual per state).
  PERFORM public.sync_purchase_ledger(oc_a);
  PERFORM public.sync_purchase_ledger(oc_b);
  PERFORM public.sync_purchase_ledger(oc_c);
  PERFORM public.sync_purchase_ledger(oc_d);

  RAISE NOTICE 'seed_13 done: 4 OCs (committed/actual/disputed/stock) + ledger fed.';
END $$;

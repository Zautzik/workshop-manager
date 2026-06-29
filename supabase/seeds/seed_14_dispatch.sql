-- ============================================================
-- SEED 14 — Despachos (guías) + Facturas de venta, demo data
--
-- Three revenue scenarios so the Despachos desk and ot_fulfillment show the
-- full picture:
--   OT-40494  full delivery (2 guías) + factura PAGADA      → loop closed
--   OT-40488  PARTIAL delivery (3M de 6M) + factura por cobrar
--   OT-40492  full delivery + factura ENVIADA (por cobrar)
--
-- Run order: AFTER 20260629140000_dispatch_and_sales_invoice.sql and seed_09.
-- Safe to re-run: YES (clears its own notes='seed_14_demo' rows first).
-- ============================================================

DO $$
DECLARE
  ot1 UUID; cli1 UUID;   -- OT-40494 LabelCorp
  ot2 UUID; cli2 UUID;   -- OT-40488 Distribuidora
  ot3 UUID; cli3 UUID;   -- OT-40492 PackBrands
  inv1 UUID; inv2 UUID; inv3 UUID;
BEGIN
  SELECT id, client_id INTO ot1, cli1 FROM public.ots WHERE ot_number = 'OT-40494' LIMIT 1;
  SELECT id, client_id INTO ot2, cli2 FROM public.ots WHERE ot_number = 'OT-40488' LIMIT 1;
  SELECT id, client_id INTO ot3, cli3 FROM public.ots WHERE ot_number = 'OT-40492' LIMIT 1;

  -- Idempotency: guías reference facturas → clear guías first, then facturas.
  DELETE FROM public.dispatch_guides WHERE notes = 'seed_14_demo';
  DELETE FROM public.sales_invoices  WHERE notes = 'seed_14_demo';

  -- ── OT-40494 — full delivery (2 guías) + factura PAGADA ──
  INSERT INTO public.sales_invoices (ot_id, client_id, client_name, net_amount, tax_amount, total_amount, status, issued_date, paid_date, notes)
  VALUES (ot1, cli1, 'LabelCorp S.A.', 110000000, 20900000, 130900000, 'paid', current_date - 5, current_date - 1, 'seed_14_demo')
  RETURNING id INTO inv1;

  INSERT INTO public.dispatch_guides (ot_id, client_id, client_name, quantity, dispatch_date, carrier, vehicle_plate, status, invoice_id, notes)
  VALUES
    (ot1, cli1, 'LabelCorp S.A.', 1900000, current_date - 7, 'Transportes Rápidos Ltda.', 'JKLM-21', 'delivered', inv1, 'seed_14_demo'),
    (ot1, cli1, 'LabelCorp S.A.', 1900000, current_date - 6, 'Transportes Rápidos Ltda.', 'JKLM-21', 'delivered', inv1, 'seed_14_demo');

  -- ── OT-40488 — PARTIAL (3M de 6M) + factura por cobrar ──
  INSERT INTO public.sales_invoices (ot_id, client_id, client_name, net_amount, tax_amount, total_amount, status, issued_date, due_date, notes)
  VALUES (ot2, cli2, 'Distribuidora Global', 54000000, 10260000, 64260000, 'issued', current_date - 3, current_date + 27, 'seed_14_demo')
  RETURNING id INTO inv2;

  INSERT INTO public.dispatch_guides (ot_id, client_id, client_name, quantity, dispatch_date, carrier, vehicle_plate, status, invoice_id, notes)
  VALUES (ot2, cli2, 'Distribuidora Global', 3000000, current_date - 4, 'Logística del Sur SpA', 'PQRS-88', 'delivered', inv2, 'seed_14_demo');

  -- ── OT-40492 — full delivery + factura ENVIADA (por cobrar) ──
  INSERT INTO public.sales_invoices (ot_id, client_id, client_name, net_amount, tax_amount, total_amount, status, issued_date, due_date, notes)
  VALUES (ot3, cli3, 'PackBrands Ltda.', 105000000, 19950000, 124950000, 'sent', current_date - 2, current_date + 28, 'seed_14_demo')
  RETURNING id INTO inv3;

  INSERT INTO public.dispatch_guides (ot_id, client_id, client_name, quantity, dispatch_date, carrier, vehicle_plate, status, invoice_id, notes)
  VALUES (ot3, cli3, 'PackBrands Ltda.', 2200000, current_date - 3, 'Transportes Rápidos Ltda.', 'TUVW-45', 'delivered', inv3, 'seed_14_demo');

  RAISE NOTICE 'seed_14 done: 3 facturas venta (pagada/por cobrar/enviada) + 4 guías.';
END $$;

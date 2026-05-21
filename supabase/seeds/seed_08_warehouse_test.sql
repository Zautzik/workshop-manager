-- =============================================================
-- Warehouse WhatsApp Tracking — Test Seed Data
--
-- Run AFTER the warehouse migration has been applied.
-- Creates sample inventory items (with barcodes), lots,
-- an employee with phone, and a few warehouse logs to test
-- the full review → feed-to-inventory flow.
-- =============================================================

-- ─── 1. Inventory Items (printing supplies) ──────────────────

INSERT INTO public.inventory_items
  (id, sku, barcode_value, qr_value, name, category, unit, min_stock, estimated_unit_cost, is_certification_required, is_active, notes)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'INK-CYAN-01',   '7501234567890', NULL, 'Tinta Cyan Offset',          'supply',        'kg',    5,  18500.0000, false, true,  'Tinta offset proceso CMYK — cyan'),
  ('a0000000-0000-0000-0000-000000000002', 'INK-MAG-01',    '7501234567891', NULL, 'Tinta Magenta Offset',        'supply',        'kg',    5,  18500.0000, false, true,  'Tinta offset proceso CMYK — magenta'),
  ('a0000000-0000-0000-0000-000000000003', 'INK-YEL-01',    '7501234567892', NULL, 'Tinta Yellow Offset',         'supply',        'kg',    5,  18500.0000, false, true,  'Tinta offset proceso CMYK — yellow'),
  ('a0000000-0000-0000-0000-000000000004', 'INK-BLK-01',    '7501234567893', NULL, 'Tinta Black Offset',          'supply',        'kg',    5,  16000.0000, false, true,  'Tinta offset proceso CMYK — black'),
  ('a0000000-0000-0000-0000-000000000005', 'PAP-BOND-75',   '7894561230001', NULL, 'Papel Bond 75g 70×100',       'product_input', 'resma', 20, 12500.0000, false, true,  'Papel bond blanco 75 g/m² pliego 70×100 cm'),
  ('a0000000-0000-0000-0000-000000000006', 'PAP-COUCH-150', '7894561230002', NULL, 'Papel Couché 150g 70×100',    'product_input', 'resma', 10, 28000.0000, false, true,  'Papel couché brillante 150 g/m² pliego 70×100 cm'),
  ('a0000000-0000-0000-0000-000000000007', 'PAP-KRAFT-120', '7894561230003', NULL, 'Papel Kraft 120g rollo',      'product_input', 'rollo', 5,  35000.0000, false, true,  'Papel kraft 120 g/m² rollo 1 m ancho'),
  ('a0000000-0000-0000-0000-000000000008', 'PLT-ALUM-01',   '4901234567890', NULL, 'Plancha Aluminio Offset CTP', 'supply',        'unit',  10, 9500.0000,  false, true,  'Plancha CTP aluminio 605×745 mm'),
  ('a0000000-0000-0000-0000-000000000009', 'MNT-RODILLO-01','4901234567891', NULL, 'Rodillo Caucho Entintado',    'spare_part',    'unit',  2,  120000.0000,false, true,  'Rodillo de caucho para cuerpo entintador'),
  ('a0000000-0000-0000-0000-000000000010', 'SOL-LAVADO-01', '4901234567892', NULL, 'Solvente Lavado Rodillos',    'supply',        'litro', 10, 8500.0000,  false, true,  'Solvente de lavado para rodillos y mantillas')
ON CONFLICT (sku) DO NOTHING;

-- ─── 2. Inventory Lots (initial stock) ──────────────────────

INSERT INTO public.inventory_lots
  (id, item_id, lot_number, supplier_name, received_date, unit_cost, quantity_received, quantity_available)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'LOT-CYAN-2604',   'Tintas del Sur SpA',  '2026-04-15', 18500.00, 20.000, 18.500),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'LOT-MAG-2604',    'Tintas del Sur SpA',  '2026-04-15', 18500.00, 20.000, 19.000),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'LOT-BOND75-2604', 'Papelera Nacional SA','2026-04-10', 12500.00, 50.000, 35.000),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006', 'LOT-COUCH-2604',  'Papelera Nacional SA','2026-04-10', 28000.00, 30.000, 28.000),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000008', 'LOT-PLAT-2604',   'CTP Express Ltda',   '2026-04-12', 9500.00,  50.000, 42.000),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000010', 'LOT-SOLV-2604',   'Químicos Industriales','2026-04-08',8500.00,  40.000, 30.000)
ON CONFLICT (item_id, lot_number) DO NOTHING;

-- ─── 3. Employee with phone (warehouse operator) ────────────

INSERT INTO public.employees
  (id, full_name, department, status, hire_date, phone, notes)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Pedro Bodeguero', 'Bodega', 'active', '2024-01-15', '+56912345678', 'Operador bodega — prueba WhatsApp warehouse')
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Sample Warehouse Logs (various statuses) ────────────
--    These let you test the dashboard immediately.

INSERT INTO public.whatsapp_warehouse_logs
  (id, action_type, item_id, item_name, item_sku, lot_id, operator_phone, operator_name, operator_employee_id,
   scanned_value, raw_message, message_timestamp, quantity, unit, unit_cost, supplier_name, review_status)
VALUES
  -- Pending: received ink via barcode scan
  ('d0000000-0000-0000-0000-000000000001',
   'receive', 'a0000000-0000-0000-0000-000000000001', 'Tinta Cyan Offset', 'INK-CYAN-01',
   NULL, '+56912345678', 'Pedro Bodeguero', 'c0000000-0000-0000-0000-000000000001',
   '7501234567890', 'recibido 5 kg tinta cyan barcode 7501234567890',
   now() - interval '2 hours',
   5.000, 'kg', 18500.0000, 'Tintas del Sur SpA', 'pending'),

  -- Pending: consumed paper for OT
  ('d0000000-0000-0000-0000-000000000002',
   'use', 'a0000000-0000-0000-0000-000000000005', 'Papel Bond 75g 70×100', 'PAP-BOND-75',
   'b0000000-0000-0000-0000-000000000003', '+56912345678', 'Pedro Bodeguero', 'c0000000-0000-0000-0000-000000000001',
   '7894561230001', 'usado 3 resmas bond 75 para OT-2460',
   now() - interval '1 hour',
   3.000, 'resma', 12500.0000, NULL, 'pending'),

  -- Pending: received plates via QR
  ('d0000000-0000-0000-0000-000000000003',
   'receive', 'a0000000-0000-0000-0000-000000000008', 'Plancha Aluminio Offset CTP', 'PLT-ALUM-01',
   NULL, '+56912345678', 'Pedro Bodeguero', 'c0000000-0000-0000-0000-000000000001',
   'WH:RECV:a0000000-0000-0000-0000-000000000008', 'WH:RECV:a0000000-0000-0000-0000-000000000008 20 planchas',
   now() - interval '30 minutes',
   20.000, 'unit', 9500.0000, 'CTP Express Ltda', 'pending'),

  -- Already approved (for history tab)
  ('d0000000-0000-0000-0000-000000000004',
   'receive', 'a0000000-0000-0000-0000-000000000010', 'Solvente Lavado Rodillos', 'SOL-LAVADO-01',
   'b0000000-0000-0000-0000-000000000006', '+56912345678', 'Pedro Bodeguero', 'c0000000-0000-0000-0000-000000000001',
   '4901234567892', 'llegaron 10 litros solvente lavado',
   now() - interval '5 hours',
   10.000, 'litro', 8500.0000, 'Químicos Industriales', 'approved'),

  -- Rejected example
  ('d0000000-0000-0000-0000-000000000005',
   'return', 'a0000000-0000-0000-0000-000000000002', 'Tinta Magenta Offset', 'INK-MAG-01',
   'b0000000-0000-0000-0000-000000000002', '+56912345678', 'Pedro Bodeguero', 'c0000000-0000-0000-0000-000000000001',
   '7501234567891', 'devuelvo 2 kg magenta sobrante',
   now() - interval '4 hours',
   2.000, 'kg', 18500.0000, NULL, 'rejected')
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Quick verification ──────────────────────────────────

DO $$
DECLARE
  v_items INT;
  v_lots  INT;
  v_logs  INT;
  v_emp   INT;
BEGIN
  SELECT count(*) INTO v_items FROM public.inventory_items WHERE sku LIKE 'INK-%' OR sku LIKE 'PAP-%' OR sku LIKE 'PLT-%' OR sku LIKE 'MNT-%' OR sku LIKE 'SOL-%';
  SELECT count(*) INTO v_lots  FROM public.inventory_lots  WHERE lot_number LIKE 'LOT-%-2604';
  SELECT count(*) INTO v_logs  FROM public.whatsapp_warehouse_logs;
  SELECT count(*) INTO v_emp   FROM public.employees WHERE phone = '+56912345678';
  RAISE NOTICE '✅ Warehouse test seed complete: % items, % lots, % warehouse logs, % operator(s)', v_items, v_lots, v_logs, v_emp;
END $$;

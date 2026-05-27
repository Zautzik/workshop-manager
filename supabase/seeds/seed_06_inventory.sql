-- ============================================================
-- SEED 06 — Inventory
-- 25 SKUs · Lots · Stock Transactions (12 months)
-- Low-stock events in each crunch month
--
-- Run order: 06 of 07
-- Depends on: 01 (machines), 02 (employees), 03 (clients), 04 (ots)
-- Safe to re-run: YES (ON CONFLICT DO NOTHING)
--
-- TINKER TIPS:
--   • Set a lot's quantity_remaining to 0 to see the low-stock
--     alert fire on the warehouse dashboard.
--   • Delete the Aug 2025 emergency purchase transaction and
--     watch the stock history gap appear in the trend chart.
--   • Change a unit_cost on an ink SKU and confirm the financial
--     impact propagates to ot_real_costs for that period.
-- ============================================================

DO $$
DECLARE
  -- inventory item IDs
  i_couche_80    UUID;  -- Couche self-adhesive roll 80gsm
  i_couche_60    UUID;  -- Couche self-adhesive roll 60gsm
  i_couche_115   UUID;  -- Couche sheet 115gsm
  i_couche_150   UUID;  -- Couche sheet 150gsm
  i_cartulina_300 UUID; -- Cartulina 300gsm C1S
  i_cartulina_350 UUID; -- Cartulina 350gsm C1S
  i_cartulina_400 UUID; -- Cartulina 400gsm C1S
  i_bond_80      UUID;  -- Bond 80gsm (office/drafts)
  i_ink_c        UUID;  -- Tinta Cyan CMYK
  i_ink_m        UUID;  -- Tinta Magenta CMYK
  i_ink_y        UUID;  -- Tinta Yellow CMYK
  i_ink_k        UUID;  -- Tinta Black CMYK
  i_p485c        UUID;  -- Pantone 485C (red pharma)
  i_p300c        UUID;  -- Pantone 300C (pharma blue)
  i_p375c        UUID;  -- Pantone 375C (green)
  i_plates_4up   UUID;  -- Placas CTP 4-up aluminum
  i_blanket      UUID;  -- Mantillas offset (blankets)
  i_solvent      UUID;  -- Solvente limpieza offset
  i_adhesive_tape UUID; -- Cinta adhesiva doble cara (finishing)
  i_plastic_film  UUID; -- Film laminado brillo/mate roll
  i_die_foil      UUID; -- Foil troquelado dorado
  i_cores        UUID;  -- Tubos/cores cartón para rollos
  i_box_small    UUID;  -- Cajas despacho pequeña
  i_box_large    UUID;  -- Cajas despacho grande
  i_stretch_wrap  UUID; -- Stretch wrap para pallets
  -- lot IDs (needed as lot_id is required by the stock-transaction trigger)
  l_adh80_2505a  UUID;  l_adh60_2505a  UUID;  l_car350_2505  UUID;
  l_p485_2505    UUID;  l_p375_2505    UUID;  l_plt_2505     UUID;
  l_blk_2505     UUID;  l_adh80_2507a  UUID;  l_adh60_2507a  UUID;
  l_p485_2507    UUID;  l_adh80_2510a  UUID;  l_p485_2510    UUID;
  l_adh80_2602a  UUID;  l_adh60_2602a  UUID;  l_p485_2602    UUID;
  l_blk_2603     UUID;
  -- OT IDs
  ot_001 UUID; ot_003 UUID; ot_008 UUID; ot_018 UUID; ot_019 UUID;
  ot_020 UUID; ot_021 UUID; ot_034 UUID; ot_036 UUID; ot_037 UUID;
  ot_011 UUID; ot_012 UUID; ot_013 UUID; ot_014 UUID;
BEGIN
  -- Resolve OTs
  SELECT id INTO ot_001 FROM public.ots WHERE ot_number = 'OT-2025-001';
  SELECT id INTO ot_003 FROM public.ots WHERE ot_number = 'OT-2025-003';
  SELECT id INTO ot_008 FROM public.ots WHERE ot_number = 'OT-2025-008';
  SELECT id INTO ot_018 FROM public.ots WHERE ot_number = 'OT-2025-018';
  SELECT id INTO ot_019 FROM public.ots WHERE ot_number = 'OT-2025-019';
  SELECT id INTO ot_020 FROM public.ots WHERE ot_number = 'OT-2025-020';
  SELECT id INTO ot_021 FROM public.ots WHERE ot_number = 'OT-2025-021';
  SELECT id INTO ot_034 FROM public.ots WHERE ot_number = 'OT-2025-034';
  SELECT id INTO ot_036 FROM public.ots WHERE ot_number = 'OT-2025-036';
  SELECT id INTO ot_037 FROM public.ots WHERE ot_number = 'OT-2025-037';
  SELECT id INTO ot_011 FROM public.ots WHERE ot_number = 'OT-2026-011';
  SELECT id INTO ot_012 FROM public.ots WHERE ot_number = 'OT-2026-012';
  SELECT id INTO ot_013 FROM public.ots WHERE ot_number = 'OT-2026-013';
  SELECT id INTO ot_014 FROM public.ots WHERE ot_number = 'OT-2026-014';

  -- ══════════════════════════════════════════════════════════
  -- INVENTORY ITEMS (25 SKUs)
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.inventory_items
    (id, sku, name, category, unit,
     min_stock, estimated_unit_cost, is_active, notes)
  VALUES
    -- SUBSTRATES
    (gen_random_uuid(), 'SUB-ADH-080', 'Couche adhesivo roll 80gsm',
     'product_input', 'kg', 500.0, 2.10, true,
     'Proveedor: PapelMax Ltda. Lead time: 3 días.'),
    (gen_random_uuid(), 'SUB-ADH-060', 'Couche adhesivo roll 60gsm',
     'product_input', 'kg', 800.0, 1.80, true,
     'Proveedor: PapelMax Ltda. Lead time: 3 días.'),
    (gen_random_uuid(), 'SUB-COU-115', 'Couche sheet 115gsm',
     'product_input', 'kg', 300.0, 1.95, true,
     'Proveedor: PapelMax Ltda.'),
    (gen_random_uuid(), 'SUB-COU-150', 'Couche sheet 150gsm',
     'product_input', 'kg', 200.0, 2.50, true,
     'Proveedor: GrafPaper S.A.'),
    (gen_random_uuid(), 'SUB-CAR-300', 'Cartulina C1S 300gsm',
     'product_input', 'kg', 400.0, 3.20, true,
     'Proveedor: GrafPaper S.A. Lead time: 5 días.'),
    (gen_random_uuid(), 'SUB-CAR-350', 'Cartulina C1S 350gsm',
     'product_input', 'kg', 350.0, 3.60, true,
     'Proveedor: GrafPaper S.A. Lead time: 5 días.'),
    (gen_random_uuid(), 'SUB-CAR-400', 'Cartulina C1S 400gsm',
     'product_input', 'kg', 150.0, 4.10, true,
     'Proveedor: GrafPaper S.A.'),
    (gen_random_uuid(), 'SUB-BON-080', 'Bond 80gsm pliego',
     'supply', 'resma', 20.0, 3.50, true, NULL),

    -- INKS
    (gen_random_uuid(), 'INK-CMYK-C', 'Tinta Cyan CMYK offset',
     'product_input', 'kg', 5.0, 12.50, true,
     'Proveedor: InkPro Chile. Renovar antes de 18 meses.'),
    (gen_random_uuid(), 'INK-CMYK-M', 'Tinta Magenta CMYK offset',
     'product_input', 'kg', 5.0, 12.50, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-CMYK-Y', 'Tinta Yellow CMYK offset',
     'product_input', 'kg', 5.0, 12.50, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-CMYK-K', 'Tinta Black CMYK offset',
     'product_input', 'kg', 6.0, 11.00, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-PAN-485C', 'Tinta Pantone 485C (rojo)',
     'product_input', 'kg', 1.5, 28.00, true,
     'Exclusivo LabelCorp / Farmavida. Lote por pedido.'),
    (gen_random_uuid(), 'INK-PAN-300C', 'Tinta Pantone 300C (azul)',
     'product_input', 'kg', 1.5, 26.00, true,
     'LabelCorp NeuroCalm / SeruNorm.'),
    (gen_random_uuid(), 'INK-PAN-375C', 'Tinta Pantone 375C (verde)',
     'product_input', 'kg', 1.0, 26.00, true, NULL),

    -- PLATES & CONSUMABLES
    (gen_random_uuid(), 'PLT-CTP-4UP', 'Plancha CTP aluminio 4up',
     'supply', 'unit', 20.0, 18.00, true,
     'Proveedor: PlanchaTech S.A. Lead time: 48h.'),
    (gen_random_uuid(), 'CON-BLK-OFF', 'Mantilla offset (blanket)',
     'spare_part', 'unit', 2.0, 95.00, true,
     'Cambiar antes de crunch. Stock mínimo: 2 unidades.'),
    (gen_random_uuid(), 'CON-SOL-OFF', 'Solvente limpieza offset',
     'supply', 'litro', 40.0, 4.20, true, NULL),
    (gen_random_uuid(), 'FIN-ADH-TAPE', 'Cinta adhesiva doble cara 25mm',
     'supply', 'rollo', 10.0, 2.80, true, NULL),
    (gen_random_uuid(), 'FIN-FILM-LAM', 'Film laminado biax BOPP roll',
     'product_input', 'kg', 30.0, 6.50, true,
     'Proveedor: Laminados Chile. Lead time: 5 días.'),
    (gen_random_uuid(), 'FIN-FOIL-GLD', 'Foil hot stamping dorado',
     'supply', 'm2', 5.0, 8.50, true,
     'Inversiones del Sur / PackBrands ediciones especiales.'),
    (gen_random_uuid(), 'EMB-CORES', 'Tubos cores cartón 76mm',
     'supply', 'unit', 50.0, 0.85, true, NULL),
    (gen_random_uuid(), 'EMB-BOX-SM', 'Caja despacho pequeña 30×20×15cm',
     'supply', 'unit', 100.0, 0.55, true, NULL),
    (gen_random_uuid(), 'EMB-BOX-LG', 'Caja despacho grande 50×40×30cm',
     'supply', 'unit', 80.0, 0.90, true, NULL),
    (gen_random_uuid(), 'EMB-STRETCH', 'Stretch wrap transparente 500mm',
     'supply', 'rollo', 10.0, 5.20, true, NULL)
  ON CONFLICT (sku) DO NOTHING;

  -- Resolve item IDs for use in lots & transactions
  SELECT id INTO i_couche_80    FROM public.inventory_items WHERE sku = 'SUB-ADH-080';
  SELECT id INTO i_couche_60    FROM public.inventory_items WHERE sku = 'SUB-ADH-060';
  SELECT id INTO i_couche_115   FROM public.inventory_items WHERE sku = 'SUB-COU-115';
  SELECT id INTO i_couche_150   FROM public.inventory_items WHERE sku = 'SUB-COU-150';
  SELECT id INTO i_cartulina_300 FROM public.inventory_items WHERE sku = 'SUB-CAR-300';
  SELECT id INTO i_cartulina_350 FROM public.inventory_items WHERE sku = 'SUB-CAR-350';
  SELECT id INTO i_cartulina_400 FROM public.inventory_items WHERE sku = 'SUB-CAR-400';
  SELECT id INTO i_ink_c        FROM public.inventory_items WHERE sku = 'INK-CMYK-C';
  SELECT id INTO i_ink_m        FROM public.inventory_items WHERE sku = 'INK-CMYK-M';
  SELECT id INTO i_ink_y        FROM public.inventory_items WHERE sku = 'INK-CMYK-Y';
  SELECT id INTO i_ink_k        FROM public.inventory_items WHERE sku = 'INK-CMYK-K';
  SELECT id INTO i_p485c        FROM public.inventory_items WHERE sku = 'INK-PAN-485C';
  SELECT id INTO i_p300c        FROM public.inventory_items WHERE sku = 'INK-PAN-300C';
  SELECT id INTO i_p375c        FROM public.inventory_items WHERE sku = 'INK-PAN-375C';
  SELECT id INTO i_plates_4up   FROM public.inventory_items WHERE sku = 'PLT-CTP-4UP';
  SELECT id INTO i_blanket      FROM public.inventory_items WHERE sku = 'CON-BLK-OFF';
  SELECT id INTO i_plastic_film FROM public.inventory_items WHERE sku = 'FIN-FILM-LAM';
  SELECT id INTO i_box_small    FROM public.inventory_items WHERE sku = 'EMB-BOX-SM';
  SELECT id INTO i_box_large    FROM public.inventory_items WHERE sku = 'EMB-BOX-LG';

  -- ══════════════════════════════════════════════════════════
  -- INVENTORY LOTS
  -- Opening lots (May 2025), replenishments, crunch purchases
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.inventory_lots
    (item_id, lot_number, supplier_name, received_date,
     quantity_received, quantity_available, unit_cost, certification_expires_on)
  VALUES
    -- Opening stock May 2025
    (i_couche_80,  'LOT-ADH80-2505A', 'PapelMax Ltda.',   '2025-05-01', 3000.0, 3000.0, 2.10, NULL),
    (i_couche_60,  'LOT-ADH60-2505A', 'PapelMax Ltda.',   '2025-05-01', 4000.0, 4000.0, 1.80, NULL),
    (i_couche_115, 'LOT-COU115-2505', 'PapelMax Ltda.',   '2025-05-01', 1500.0, 1500.0, 1.95, NULL),
    (i_couche_150, 'LOT-COU150-2505', 'GrafPaper S.A.',   '2025-05-01',  800.0,  800.0, 2.50, NULL),
    (i_cartulina_300,'LOT-CAR300-2505','GrafPaper S.A.',  '2025-05-01', 2000.0, 2000.0, 3.20, NULL),
    (i_cartulina_350,'LOT-CAR350-2505','GrafPaper S.A.',  '2025-05-01', 2500.0, 2500.0, 3.60, NULL),
    (i_cartulina_400,'LOT-CAR400-2505','GrafPaper S.A.',  '2025-05-01',  800.0,  800.0, 4.10, NULL),
    (i_ink_c,      'LOT-INKC-2505',   'InkPro Chile',     '2025-05-01',   30.0,   30.0, 12.50, '2026-11-01'),
    (i_ink_m,      'LOT-INKM-2505',   'InkPro Chile',     '2025-05-01',   30.0,   30.0, 12.50, '2026-11-01'),
    (i_ink_y,      'LOT-INKY-2505',   'InkPro Chile',     '2025-05-01',   30.0,   30.0, 12.50, '2026-11-01'),
    (i_ink_k,      'LOT-INKK-2505',   'InkPro Chile',     '2025-05-01',   35.0,   35.0, 11.00, '2026-11-01'),
    (i_p485c,      'LOT-P485-2505',   'InkPro Chile',     '2025-05-05',    6.0,    6.0, 28.00, '2026-05-05'),
    (i_p300c,      'LOT-P300-2505',   'InkPro Chile',     '2025-05-05',    6.0,    6.0, 26.00, '2026-05-05'),
    (i_p375c,      'LOT-P375-2505',   'InkPro Chile',     '2025-05-05',    4.0,    4.0, 26.00, '2026-05-05'),
    (i_plates_4up, 'LOT-PLT-2505',    'PlanchaTech S.A.', '2025-05-01',  200.0,  200.0, 18.00, NULL),
    (i_blanket,    'LOT-BLK-2505',    'Impresiones S.A.', '2025-05-01',    8.0,    8.0, 95.00, NULL),
    (i_plastic_film,'LOT-FILM-2505',  'Laminados Chile',  '2025-05-05',  400.0,  400.0,  6.50, NULL),

    -- Pre-crunch replenishment July 2025
    (i_couche_80,  'LOT-ADH80-2507A', 'PapelMax Ltda.',   '2025-07-25', 4000.0, 4000.0, 2.10, NULL),
    (i_couche_60,  'LOT-ADH60-2507A', 'PapelMax Ltda.',   '2025-07-25', 5000.0, 5000.0, 1.80, NULL),
    (i_p485c,      'LOT-P485-2507',   'InkPro Chile',     '2025-07-28',   12.0,   12.0, 28.00, '2026-07-28'),
    (i_plates_4up, 'LOT-PLT-2507',    'PlanchaTech S.A.', '2025-07-28',  300.0,  300.0, 18.00, NULL),

    -- EMERGENCY PURCHASE Aug 2025 — couche 80gsm near zero
    (i_couche_80,  'LOT-ADH80-2508E', 'PapelMax Ltda.',   '2025-08-19', 2000.0, 2000.0, 2.25, NULL),

    -- Pre-crunch Nov 2025
    (i_couche_80,  'LOT-ADH80-2510A', 'PapelMax Ltda.',   '2025-10-28', 4500.0, 4500.0, 2.12, NULL),
    (i_p485c,      'LOT-P485-2510',   'InkPro Chile',     '2025-10-28',   15.0,   15.0, 28.00, '2026-10-28'),
    (i_ink_c,      'LOT-INKC-2510',   'InkPro Chile',     '2025-10-28',   40.0,   40.0, 12.50, '2027-04-01'),
    (i_ink_m,      'LOT-INKM-2510',   'InkPro Chile',     '2025-10-28',   40.0,   40.0, 12.50, '2027-04-01'),
    (i_ink_y,      'LOT-INKY-2510',   'InkPro Chile',     '2025-10-28',   40.0,   40.0, 12.50, '2027-04-01'),
    (i_ink_k,      'LOT-INKK-2510',   'InkPro Chile',     '2025-10-28',   45.0,   45.0, 11.00, '2027-04-01'),

    -- Pre-crunch Feb 2026 (for Mar crunch)
    (i_couche_80,  'LOT-ADH80-2602A', 'PapelMax Ltda.',   '2026-02-23', 5000.0, 5000.0, 2.15, NULL),
    (i_couche_60,  'LOT-ADH60-2602A', 'PapelMax Ltda.',   '2026-02-23', 5500.0, 5500.0, 1.82, NULL),
    (i_p485c,      'LOT-P485-2602',   'InkPro Chile',     '2026-02-23',   18.0,   18.0, 28.50, '2027-02-23'),
    (i_blanket,    'LOT-BLK-2603',    'Impresiones S.A.', '2026-03-03',    4.0,    4.0, 97.00, NULL),

    -- Current balances (Apr 2026 — post Q3 crunch)
    (i_couche_80,  'LOT-ADH80-2604',  'PapelMax Ltda.',   '2026-04-01', 3500.0, 3500.0, 2.15, NULL),
    (i_couche_60,  'LOT-ADH60-2604',  'PapelMax Ltda.',   '2026-04-01', 4000.0, 4000.0, 1.82, NULL),
    (i_plates_4up, 'LOT-PLT-2604',    'PlanchaTech S.A.', '2026-04-01',  300.0,  300.0, 18.50, NULL)
  ON CONFLICT (item_id, lot_number) DO NOTHING;

  -- Resolve lot IDs for transaction lot_id references (required by trigger)
  SELECT id INTO l_adh80_2505a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH80-2505A';
  SELECT id INTO l_adh60_2505a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH60-2505A';
  SELECT id INTO l_car350_2505  FROM public.inventory_lots WHERE lot_number = 'LOT-CAR350-2505';
  SELECT id INTO l_p485_2505    FROM public.inventory_lots WHERE lot_number = 'LOT-P485-2505';
  SELECT id INTO l_p375_2505    FROM public.inventory_lots WHERE lot_number = 'LOT-P375-2505';
  SELECT id INTO l_plt_2505     FROM public.inventory_lots WHERE lot_number = 'LOT-PLT-2505';
  SELECT id INTO l_blk_2505     FROM public.inventory_lots WHERE lot_number = 'LOT-BLK-2505';
  SELECT id INTO l_adh80_2507a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH80-2507A';
  SELECT id INTO l_adh60_2507a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH60-2507A';
  SELECT id INTO l_p485_2507    FROM public.inventory_lots WHERE lot_number = 'LOT-P485-2507';
  SELECT id INTO l_adh80_2510a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH80-2510A';
  SELECT id INTO l_p485_2510    FROM public.inventory_lots WHERE lot_number = 'LOT-P485-2510';
  SELECT id INTO l_adh80_2602a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH80-2602A';
  SELECT id INTO l_adh60_2602a FROM public.inventory_lots WHERE lot_number = 'LOT-ADH60-2602A';
  SELECT id INTO l_p485_2602    FROM public.inventory_lots WHERE lot_number = 'LOT-P485-2602';
  SELECT id INTO l_blk_2603     FROM public.inventory_lots WHERE lot_number = 'LOT-BLK-2603';

  -- ══════════════════════════════════════════════════════════
  -- STOCK TRANSACTIONS
  -- Consumption & purchases keyed to real OTs
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.inventory_stock_transactions
    (item_id, lot_id, work_order_id, tx_type, quantity, unit_cost,
     reference_code, notes, created_at)
  VALUES
    -- May 2025 — opening consumptions
    (i_couche_80,  l_adh80_2505a, ot_001, 'consumption', 185.0, 2.10,
     'CON-2025-001',  'Consumo OT-2025-001 LabelCorp NeuroCalm 3.2M',    '2025-05-12'),
    (i_p485c,      l_p485_2505,   ot_001, 'consumption',   0.85, 28.00,
     'CON-2025-001B', 'Pantone 485C OT-2025-001',                         '2025-05-12'),
    (i_couche_60,  l_adh60_2505a, ot_003, 'consumption', 220.0, 1.80,
     'CON-2025-003',  'Consumo OT-2025-003 Distribuidora 5.5M',           '2025-05-22'),
    (i_plates_4up, l_plt_2505,    ot_001, 'consumption',   4.0, 18.00,
     'CON-2025-001P', 'Planchas CTP OT-2025-001',                         '2025-05-10'),

    -- Jun 2025
    (i_couche_80,  l_adh80_2505a, ot_008, 'consumption', 155.0, 2.10,
     'CON-2025-008',  'AllerFree blister Jun LabelCorp',                  '2025-06-11'),
    (i_p485c,      l_p485_2505,   ot_008, 'consumption',   0.65, 28.00,
     'CON-2025-008B', 'Pantone 485C OT-008',                              '2025-06-11'),

    -- Aug 2025 crunch consumptions
    (i_couche_80,    l_adh80_2507a, ot_018, 'consumption', 420.0, 2.10,
     'CON-2025-018',  'Couche 80gsm OT-018 LabelCorp NeuroCalm Q1',      '2025-08-11'),
    (i_p485c,        l_p485_2507,   ot_018, 'consumption',   1.80, 28.00,
     'CON-2025-018B', 'Pantone 485C OT-018',                              '2025-08-11'),
    (i_couche_80,    l_adh80_2507a, ot_019, 'consumption', 195.0, 2.10,
     'CON-2025-019',  'Couche 80gsm OT-019 LabelCorp AllerFree Q1',      '2025-08-18'),
    (i_cartulina_350, l_car350_2505, ot_020, 'consumption', 580.0, 3.60,
     'CON-2025-020',  'Cartulina 350gsm OT-020 PackBrands HogarMax Q1',  '2025-08-11'),
    (i_couche_60,    l_adh60_2507a, ot_021, 'consumption', 310.0, 1.80,
     'CON-2025-021',  'Couche 60gsm OT-021 Distribuidora Promo Verano Q1','2025-08-18'),

    -- Nov 2025 crunch
    (i_couche_80,  l_adh80_2510a, ot_034, 'consumption', 510.0, 2.12,
     'CON-2025-034',  'NeuroCalm Q2 LabelCorp — 4M etiquetas',            '2025-11-10'),
    (i_p485c,      l_p485_2510,   ot_034, 'consumption',   2.10, 28.00,
     'CON-2025-034B', 'Pantone 485C OT-034 crunch Q2',                   '2025-11-10'),
    (i_couche_80,  l_adh80_2510a, ot_036, 'consumption', 620.0, 2.12,
     'CON-2025-036',  'ShineMax Q2 PackBrands — 2M etiquetas',            '2025-11-10'),
    (i_p375c,      l_p375_2505,   ot_036, 'consumption',   1.20, 26.00,
     'CON-2025-036B', 'Pantone 375C OT-036',                              '2025-11-10'),
    (i_couche_60,  l_adh60_2507a, ot_037, 'consumption', 380.0, 1.80,
     'CON-2025-037',  'Distribuidora Promo Navidad Q2 — 6M — noche',      '2025-11-17'),

    -- Mar 2026 crunch
    (i_couche_80,    l_adh80_2602a, ot_011, 'consumption', 490.0, 2.15,
     'CON-2026-011',  'NeuroCalm Q3 LabelCorp — 3.8M — AVERIA DIA 3',    '2026-03-09'),
    (i_p485c,        l_p485_2602,   ot_011, 'consumption',   1.95, 28.50,
     'CON-2026-011B', 'Pantone 485C OT-011 Q3',                          '2026-03-09'),
    (i_couche_80,    l_adh80_2602a, ot_012, 'consumption', 210.0, 2.15,
     'CON-2026-012',  'AllerFree Q3 LabelCorp — 3M — Ryobi #2',          '2026-03-11'),
    (i_cartulina_350, l_car350_2505, ot_013, 'consumption', 640.0, 3.60,
     'CON-2026-013',  'HogarMax Q3 PackBrands — 2.4M (1.8M in-house)',   '2026-03-14'),
    (i_couche_60,    l_adh60_2602a, ot_014, 'consumption', 350.0, 1.82,
     'CON-2026-014',  'Distrib. Promo Primavera Q3 — noche — 5.8M',      '2026-03-17'),

    -- Blanket replacement (Mar 2026 — after Ryobi #1 repair)
    (i_blanket,    l_blk_2603,    NULL, 'consumption', 1.0, 97.00,
     'MAINT-2026-R1-01',
     'Reemplazo mantilla Ryobi #1 post-averia cojinete. Tecnico Impresiones S.A.',
     '2026-03-13')

  ON CONFLICT DO NOTHING;

END $$;

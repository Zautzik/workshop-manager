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
    (id, sku, name, description, category, unit_of_measure,
     unit_cost, reorder_point, reorder_quantity, is_active, notes)
  VALUES
    -- SUBSTRATES
    (gen_random_uuid(), 'SUB-ADH-080', 'Couche adhesivo roll 80gsm',
     'Papel couche autocopiante 80gsm en rollo para Ryobi. Farmacéutico/premium.',
     'papel_sustrato', 'kg', 2.10, 500.0, 1500.0, true,
     'Proveedor: PapelMax Ltda. Lead time: 3 días.'),
    (gen_random_uuid(), 'SUB-ADH-060', 'Couche adhesivo roll 60gsm',
     'Papel couche autocopiante 60gsm en rollo. Economía, alto volumen.',
     'papel_sustrato', 'kg', 1.80, 800.0, 2000.0, true,
     'Proveedor: PapelMax Ltda. Lead time: 3 días.'),
    (gen_random_uuid(), 'SUB-COU-115', 'Couche sheet 115gsm',
     'Pliego couche 115gsm para etiquetas alimentarias.',
     'papel_sustrato', 'kg', 1.95, 300.0, 900.0, true,
     'Proveedor: PapelMax Ltda.'),
    (gen_random_uuid(), 'SUB-COU-150', 'Couche sheet 150gsm',
     'Pliego couche 150gsm premium para vinos y cosméticos.',
     'papel_sustrato', 'kg', 2.50, 200.0, 600.0, true,
     'Proveedor: GrafPaper S.A.'),
    (gen_random_uuid(), 'SUB-CAR-300', 'Cartulina C1S 300gsm',
     'Cartulina blanca calandrada una cara 300gsm. Cajas plegadizas.',
     'papel_sustrato', 'kg', 3.20, 400.0, 1200.0, true,
     'Proveedor: GrafPaper S.A. Lead time: 5 días.'),
    (gen_random_uuid(), 'SUB-CAR-350', 'Cartulina C1S 350gsm',
     'Cartulina blanca calandrada una cara 350gsm. Cajas premium.',
     'papel_sustrato', 'kg', 3.60, 350.0, 1000.0, true,
     'Proveedor: GrafPaper S.A. Lead time: 5 días.'),
    (gen_random_uuid(), 'SUB-CAR-400', 'Cartulina C1S 400gsm',
     'Cartulina 400gsm para cajas regalo premium.',
     'papel_sustrato', 'kg', 4.10, 150.0, 500.0, true,
     'Proveedor: GrafPaper S.A.'),
    (gen_random_uuid(), 'SUB-BON-080', 'Bond 80gsm pliego',
     'Bond 80gsm para pruebas, contratos, borradores internos.',
     'papel_sustrato', 'resma', 3.50, 20.0, 50.0, true, NULL),

    -- INKS
    (gen_random_uuid(), 'INK-CMYK-C', 'Tinta Cyan CMYK offset',
     'Tinta proceso Cyan para Ryobi 524GS. 2.5kg lata.',
     'tinta', 'kg', 12.50, 5.0, 15.0, true,
     'Proveedor: InkPro Chile. Renovar antes de 18 meses.'),
    (gen_random_uuid(), 'INK-CMYK-M', 'Tinta Magenta CMYK offset',
     'Tinta proceso Magenta para Ryobi 524GS. 2.5kg lata.',
     'tinta', 'kg', 12.50, 5.0, 15.0, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-CMYK-Y', 'Tinta Yellow CMYK offset',
     'Tinta proceso Yellow para Ryobi 524GS. 2.5kg lata.',
     'tinta', 'kg', 12.50, 5.0, 15.0, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-CMYK-K', 'Tinta Black CMYK offset',
     'Tinta proceso Black para Ryobi 524GS. 2.5kg lata.',
     'tinta', 'kg', 11.00, 6.0, 18.0, true,
     'Proveedor: InkPro Chile.'),
    (gen_random_uuid(), 'INK-PAN-485C', 'Tinta Pantone 485C (rojo)',
     'Pantone 485C especial. 1kg lata. Farmacéutico LabelCorp.',
     'tinta', 'kg', 28.00, 1.5, 5.0, true,
     'Exclusivo LabelCorp / Farmavida. Lote por pedido.'),
    (gen_random_uuid(), 'INK-PAN-300C', 'Tinta Pantone 300C (azul)',
     'Pantone 300C especial. 1kg lata.',
     'tinta', 'kg', 26.00, 1.5, 5.0, true,
     'LabelCorp NeuroCalm / SeruNorm.'),
    (gen_random_uuid(), 'INK-PAN-375C', 'Tinta Pantone 375C (verde)',
     'Pantone 375C. PackBrands ShineMax.',
     'tinta', 'kg', 26.00, 1.0, 4.0, true, NULL),

    -- PLATES & CONSUMABLES
    (gen_random_uuid(), 'PLT-CTP-4UP', 'Plancha CTP aluminio 4up',
     'Plancha offset CTP aluminio 350×450mm (4up). Ryobi 524GS.',
     'planchas', 'unit', 18.00, 20.0, 60.0, true,
     'Proveedor: PlanchaTech S.A. Lead time: 48h.'),
    (gen_random_uuid(), 'CON-BLK-OFF', 'Mantilla offset (blanket)',
     'Mantilla offset para Ryobi 524GS. Cambio cada 200h aprox.',
     'insumo_maquina', 'unit', 95.00, 2.0, 6.0, true,
     'Cambiar antes de crunch. Stock mínimo: 2 unidades.'),
    (gen_random_uuid(), 'CON-SOL-OFF', 'Solvente limpieza offset',
     'Solvente no inflamable para limpieza de tinteros y mantillas. 20L bidón.',
     'insumo_maquina', 'litro', 4.20, 40.0, 120.0, true, NULL),
    (gen_random_uuid(), 'FIN-ADH-TAPE', 'Cinta adhesiva doble cara 25mm',
     'Cinta doble cara para terminaciones manuales y etiquetado.',
     'terminaciones', 'rollo', 2.80, 10.0, 30.0, true, NULL),
    (gen_random_uuid(), 'FIN-FILM-LAM', 'Film laminado biax BOPP roll',
     'Film BOPP transparente para laminado brillo/mate. Roll 1050mm ancho.',
     'terminaciones', 'kg', 6.50, 30.0, 100.0, true,
     'Proveedor: Laminados Chile. Lead time: 5 días.'),
    (gen_random_uuid(), 'FIN-FOIL-GLD', 'Foil hot stamping dorado',
     'Foil metalizado dorado para hot stamping troquelado premium.',
     'terminaciones', 'm2', 8.50, 5.0, 20.0, true,
     'Inversiones del Sur / PackBrands ediciones especiales.'),
    (gen_random_uuid(), 'EMB-CORES', 'Tubos cores cartón 76mm',
     'Tubos de cartón 76mm para armado de rollos. Largo 1050mm.',
     'embalaje', 'unit', 0.85, 50.0, 200.0, true, NULL),
    (gen_random_uuid(), 'EMB-BOX-SM', 'Caja despacho pequeña 30×20×15cm',
     'Caja corrugada para despacho de pedidos pequeños.',
     'embalaje', 'unit', 0.55, 100.0, 300.0, true, NULL),
    (gen_random_uuid(), 'EMB-BOX-LG', 'Caja despacho grande 50×40×30cm',
     'Caja corrugada para despacho pallets grandes.',
     'embalaje', 'unit', 0.90, 80.0, 200.0, true, NULL),
    (gen_random_uuid(), 'EMB-STRETCH', 'Stretch wrap transparente 500mm',
     'Film stretch para asegurar pallets antes de despacho.',
     'embalaje', 'rollo', 5.20, 10.0, 30.0, true, NULL)
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
    (item_id, lot_number, supplier_name, purchase_date,
     quantity_received, quantity_remaining, unit_cost, expiry_date, notes)
  VALUES
    -- Opening stock May 2025
    (i_couche_80,  'LOT-ADH80-2505A', 'PapelMax Ltda.',   '2025-05-01', 3000.0, 220.0, 2.10, NULL,
     'Stock apertura. Consumo estimado 350kg/mes en temporada normal.'),
    (i_couche_60,  'LOT-ADH60-2505A', 'PapelMax Ltda.',   '2025-05-01', 4000.0, 380.0, 1.80, NULL,
     'Stock apertura.'),
    (i_couche_115, 'LOT-COU115-2505', 'PapelMax Ltda.',   '2025-05-01', 1500.0, 310.0, 1.95, NULL, NULL),
    (i_couche_150, 'LOT-COU150-2505', 'GrafPaper S.A.',   '2025-05-01',  800.0, 420.0, 2.50, NULL, NULL),
    (i_cartulina_300,'LOT-CAR300-2505','GrafPaper S.A.',  '2025-05-01', 2000.0, 490.0, 3.20, NULL, NULL),
    (i_cartulina_350,'LOT-CAR350-2505','GrafPaper S.A.',  '2025-05-01', 2500.0, 580.0, 3.60, NULL, NULL),
    (i_cartulina_400,'LOT-CAR400-2505','GrafPaper S.A.',  '2025-05-01',  800.0, 750.0, 4.10, NULL, NULL),
    (i_ink_c,      'LOT-INKC-2505',   'InkPro Chile',     '2025-05-01',   30.0,   8.5, 12.50, '2026-11-01',
     'CMYK Cyan apertura.'),
    (i_ink_m,      'LOT-INKM-2505',   'InkPro Chile',     '2025-05-01',   30.0,   7.2, 12.50, '2026-11-01', NULL),
    (i_ink_y,      'LOT-INKY-2505',   'InkPro Chile',     '2025-05-01',   30.0,   9.1, 12.50, '2026-11-01', NULL),
    (i_ink_k,      'LOT-INKK-2505',   'InkPro Chile',     '2025-05-01',   35.0,  11.3, 11.00, '2026-11-01', NULL),
    (i_p485c,      'LOT-P485-2505',   'InkPro Chile',     '2025-05-05',    6.0,   1.2, 28.00, '2026-05-05',
     'Exclusivo LabelCorp/Farmavida.'),
    (i_p300c,      'LOT-P300-2505',   'InkPro Chile',     '2025-05-05',    6.0,   1.8, 26.00, '2026-05-05', NULL),
    (i_p375c,      'LOT-P375-2505',   'InkPro Chile',     '2025-05-05',    4.0,   2.1, 26.00, '2026-05-05', NULL),
    (i_plates_4up, 'LOT-PLT-2505',    'PlanchaTech S.A.', '2025-05-01',  200.0,  62.0, 18.00, NULL, NULL),
    (i_blanket,    'LOT-BLK-2505',    'Impresiones S.A.', '2025-05-01',    8.0,   4.0, 95.00, NULL,
     'Stock mínimo 2 por máquina. Cambio cada 200h.'),
    (i_plastic_film,'LOT-FILM-2505',  'Laminados Chile',  '2025-05-05',  400.0, 145.0, 6.50, NULL, NULL),

    -- Pre-crunch replenishment July 2025
    (i_couche_80,  'LOT-ADH80-2507A', 'PapelMax Ltda.',   '2025-07-25', 4000.0, 1200.0, 2.10, NULL,
     'Compra previa a crunch agosto. Volumen incrementado.'),
    (i_couche_60,  'LOT-ADH60-2507A', 'PapelMax Ltda.',   '2025-07-25', 5000.0, 1850.0, 1.80, NULL,
     'Compra previa a crunch agosto.'),
    (i_p485c,      'LOT-P485-2507',   'InkPro Chile',     '2025-07-28',   12.0,   4.5, 28.00, '2026-07-28',
     'Anticipada para volumen NeuroCalm + AllerFree Q1.'),
    (i_plates_4up, 'LOT-PLT-2507',    'PlanchaTech S.A.', '2025-07-28',  300.0, 185.0, 18.00, NULL,
     'Reposición crunch.'),

    -- EMERGENCY PURCHASE Aug 2025 — couche 80gsm near zero
    (i_couche_80,  'LOT-ADH80-2508E', 'PapelMax Ltda.',   '2025-08-19', 2000.0, 980.0, 2.25, NULL,
     '🚨 COMPRA EMERGENCIA. Stock llegó a 42kg el 18/08 (bajo punto de reorden). '
     'Precio +7% por urgencia. Proveedor entregó en 18h.'),

    -- Pre-crunch Nov 2025
    (i_couche_80,  'LOT-ADH80-2510A', 'PapelMax Ltda.',   '2025-10-28', 4500.0, 2100.0, 2.12, NULL,
     'Compra anticipada crunch noviembre.'),
    (i_p485c,      'LOT-P485-2510',   'InkPro Chile',     '2025-10-28',   15.0,   7.2, 28.00, '2026-10-28', NULL),
    (i_ink_c,      'LOT-INKC-2510',   'InkPro Chile',     '2025-10-28',   40.0,  22.0, 12.50, '2027-04-01', NULL),
    (i_ink_m,      'LOT-INKM-2510',   'InkPro Chile',     '2025-10-28',   40.0,  20.5, 12.50, '2027-04-01', NULL),
    (i_ink_y,      'LOT-INKY-2510',   'InkPro Chile',     '2025-10-28',   40.0,  21.8, 12.50, '2027-04-01', NULL),
    (i_ink_k,      'LOT-INKK-2510',   'InkPro Chile',     '2025-10-28',   45.0,  28.4, 11.00, '2027-04-01', NULL),

    -- Pre-crunch Feb 2026 (for Mar crunch)
    (i_couche_80,  'LOT-ADH80-2602A', 'PapelMax Ltda.',   '2026-02-23', 5000.0, 3100.0, 2.15, NULL,
     'Compra anticipada crunch marzo 2026.'),
    (i_couche_60,  'LOT-ADH60-2602A', 'PapelMax Ltda.',   '2026-02-23', 5500.0, 3400.0, 1.82, NULL, NULL),
    (i_p485c,      'LOT-P485-2602',   'InkPro Chile',     '2026-02-23',   18.0,  10.5, 28.50, '2027-02-23',
     'Precio subió 1.8% vs año anterior.'),
    (i_blanket,    'LOT-BLK-2603',    'Impresiones S.A.', '2026-03-03',    4.0,   4.0, 97.00, NULL,
     'Compra preventiva antes del crunch. Precio +2%.'),

    -- Current balances (Apr 2026 — post Q3 crunch)
    (i_couche_80,  'LOT-ADH80-2604',  'PapelMax Ltda.',   '2026-04-01', 3500.0, 2850.0, 2.15, NULL, 'Stock actual.'),
    (i_couche_60,  'LOT-ADH60-2604',  'PapelMax Ltda.',   '2026-04-01', 4000.0, 3200.0, 1.82, NULL, 'Stock actual.'),
    (i_plates_4up, 'LOT-PLT-2604',    'PlanchaTech S.A.', '2026-04-01',  300.0, 245.0, 18.50, NULL, 'Stock actual.')
  ON CONFLICT (lot_number) DO NOTHING;

  -- ══════════════════════════════════════════════════════════
  -- STOCK TRANSACTIONS
  -- Consumption & purchases keyed to real OTs
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.inventory_stock_transactions
    (item_id, ot_id, transaction_type, quantity, unit_cost, transaction_date,
     reference_number, notes)
  VALUES
    -- May 2025 — opening consumptions
    (i_couche_80, ot_001, 'egreso', -185.0, 2.10, '2025-05-12',
     'CON-2025-001', 'Consumo OT-2025-001 LabelCorp NeuroCalm 3.2M'),
    (i_p485c, ot_001, 'egreso', -0.85, 28.00, '2025-05-12',
     'CON-2025-001B', 'Pantone 485C OT-2025-001'),
    (i_couche_60, ot_003, 'egreso', -220.0, 1.80, '2025-05-22',
     'CON-2025-003', 'Consumo OT-2025-003 Distribuidora 5.5M'),
    (i_plates_4up, ot_001, 'egreso', -4.0, 18.00, '2025-05-10',
     'CON-2025-001P', 'Planchas CTP OT-2025-001'),

    -- Aug 2025 crunch consumptions
    (i_couche_80, ot_018, 'egreso', -420.0, 2.10, '2025-08-11',
     'CON-2025-018', 'Couche 80gsm OT-018 LabelCorp NeuroCalm Q1'),
    (i_p485c, ot_018, 'egreso', -1.80, 28.00, '2025-08-11',
     'CON-2025-018B', 'Pantone 485C OT-018'),
    (i_couche_80, ot_019, 'egreso', -195.0, 2.10, '2025-08-18',
     'CON-2025-019', 'Couche 80gsm OT-019 LabelCorp AllerFree Q1'),
    (i_cartulina_350, ot_020, 'egreso', -580.0, 3.60, '2025-08-11',
     'CON-2025-020', 'Cartulina 350gsm OT-020 PackBrands HogarMax Q1'),
    (i_couche_60, ot_021, 'egreso', -310.0, 1.80, '2025-08-18',
     'CON-2025-021', 'Couche 60gsm OT-021 Distribuidora Promo Verano Q1'),

    -- Emergency purchase Aug 2025 (triggered by low stock)
    (i_couche_80, NULL, 'ingreso', 2000.0, 2.25, '2025-08-19',
     'PO-2025-EMG-001',
     '🚨 COMPRA EMERGENCIA. Stock llegó a 42kg el 18/08. '
     'Precio +7% urgencia. Proveedor PapelMax entregó en 18h. '
     'OT-021 casi paralizada. Ver mantenimiento preventivo de stock.'),

    -- Jun 2025
    (i_couche_80, ot_008, 'egreso', -155.0, 2.10, '2025-06-11',
     'CON-2025-008', 'AllerFree blister Jun LabelCorp'),
    (i_p485c, ot_008, 'egreso', -0.65, 28.00, '2025-06-11',
     'CON-2025-008B', 'Pantone 485C OT-008'),

    -- Nov 2025 crunch
    (i_couche_80, ot_034, 'egreso', -510.0, 2.12, '2025-11-10',
     'CON-2025-034', 'NeuroCalm Q2 LabelCorp — 4M etiquetas'),
    (i_p485c, ot_034, 'egreso', -2.10, 28.00, '2025-11-10',
     'CON-2025-034B', 'Pantone 485C OT-034 crunch Q2'),
    (i_couche_80, ot_036, 'egreso', -620.0, 2.12, '2025-11-10',
     'CON-2025-036', 'ShineMax Q2 PackBrands — 2M etiquetas'),
    (i_p375c, ot_036, 'egreso', -1.20, 26.00, '2025-11-10',
     'CON-2025-036B', 'Pantone 375C OT-036'),
    (i_couche_60, ot_037, 'egreso', -380.0, 1.80, '2025-11-17',
     'CON-2025-037', 'Distribuidora Promo Navidad Q2 — 6M — noche'),

    -- Mar 2026 crunch
    (i_couche_80, ot_011, 'egreso', -490.0, 2.15, '2026-03-09',
     'CON-2026-011', 'NeuroCalm Q3 LabelCorp — 3.8M — AVERÍA DÍA 3'),
    (i_p485c, ot_011, 'egreso', -1.95, 28.50, '2026-03-09',
     'CON-2026-011B', 'Pantone 485C OT-011 Q3'),
    (i_couche_80, ot_012, 'egreso', -210.0, 2.15, '2026-03-11',
     'CON-2026-012', 'AllerFree Q3 LabelCorp — 3M — Ryobi #2'),
    (i_cartulina_350, ot_013, 'egreso', -640.0, 3.60, '2026-03-14',
     'CON-2026-013', 'HogarMax Q3 PackBrands — 2.4M (1.8M in-house)'),
    (i_couche_60, ot_014, 'egreso', -350.0, 1.82, '2026-03-17',
     'CON-2026-014', 'Distrib. Promo Primavera Q3 — noche — 5.8M'),

    -- Blanket replacement (Mar 2026 — after Ryobi #1 repair)
    (i_blanket, NULL, 'egreso', -1.0, 95.00, '2026-03-13',
     'MAINT-2026-R1-01',
     'Reemplazo mantilla Ryobi #1 post-avería cojinete. '
     'Técnico Impresiones S.A. recomendó cambio preventivo.')

  ON CONFLICT DO NOTHING;

END $$;

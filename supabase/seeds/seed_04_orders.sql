-- ============================================================
-- SEED 04 — 12 Months of Orders (OTs)
-- May 2025 → Apr 2026  |  ~140 OTs  |  $300K/mo target
-- 3 anchor clients with quarterly crunches (Aug, Nov, Mar)
--
-- Run order: 04 of 07
-- Depends on: 01 (machines), 02 (employees), 03 (clients)
-- Safe to re-run: YES (ON CONFLICT (ot_number) DO NOTHING)
--
-- REVENUE MODEL (monthly):
--   Normal months:  $270–290K  (~10–12 OTs)
--   Crunch months:  $350–390K  (~18–22 OTs)
--   Dec 2025:       ~$200K     (holiday slowdown)
--   Year total:     ~$3.62M    → avg $301K/mo
-- ============================================================

DO $$
DECLARE
  -- Client IDs
  c_label  UUID; c_pack  UUID; c_dist  UUID;
  c_farma  UUID; c_norte UUID; c_sur   UUID; c_expr  UUID;
  -- Machine IDs
  m_r1 UUID; m_r2 UUID; m_dc UUID; m_g1 UUID;
BEGIN
  -- Resolve clients
  SELECT id INTO c_label FROM clients WHERE rut = '76.123.456-7' LIMIT 1;
  SELECT id INTO c_pack  FROM clients WHERE rut = '77.654.321-K' LIMIT 1;
  SELECT id INTO c_dist  FROM clients WHERE rut = '78.999.888-3' LIMIT 1;
  SELECT id INTO c_farma FROM clients WHERE rut = '76.445.112-5' LIMIT 1;
  SELECT id INTO c_norte FROM clients WHERE rut = '76.778.334-8' LIMIT 1;
  SELECT id INTO c_sur   FROM clients WHERE rut = '77.002.556-1' LIMIT 1;
  SELECT id INTO c_expr  FROM clients WHERE rut = '76.101.202-9' LIMIT 1;

  -- Resolve machines
  SELECT id INTO m_r1 FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #1' LIMIT 1;
  SELECT id INTO m_r2 FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #2' LIMIT 1;
  SELECT id INTO m_dc FROM public.machines WHERE lower(name) = 'die cutter #1'          LIMIT 1;
  SELECT id INTO m_g1 FROM public.machines WHERE lower(name) = 'guillotine #1'          LIMIT 1;

  -- ══════════════════════════════════════════════════════════
  -- MAY 2025 — NORMAL  (~$282K)
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.ots (ot_number, client_id, client_name, description, quantity, status,
    product_name, product_type, priority_level,
    width_cm, height_cm, substrate_type, grammage_gsm,
    color_front, color_back,
    finish_troquelado, finish_laminado, finish_barniz,
    calc_sheets, calc_plates,
    subtotal, margin_pct, margin_amount, increment_pct, increment_amount,
    commission_pct, commission_amount, total_price, unit_price,
    deadline, assigned_machine_id,
    flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived,
    notes)
  VALUES
    ('OT-2025-001', c_label, 'LabelCorp S.A.',
     'Etiquetas adheridas frente-dorso frasco 50ml — Producto: NeuroCalm 50',
     3200000, 'completed',
     'Etiqueta NeuroCalm 50ml', 'etiqueta', 'normal',
     5.5, 9.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, false, false,
     42667, 4,
     65000, 30, 19500, 10, 8450, 1, 929, 93879, 0.0293,
     '2025-05-23', m_r1,
     true, true, true, true, true,
     'Pantone 485C (rojo) + 300C (azul). Adhesivo permanente. Troquelado elipse. '
     'Certificación lote requerida para trazabilidad farmacéutica.'),

    ('OT-2025-002', c_pack, 'PackBrands Ltda.',
     'Caja plegadiza producto limpieza hogar — HogarMax Lavanda',
     850000, 'completed',
     'Caja HogarMax Lavanda 200ml', 'caja_plegadiza', 'normal',
     11.5, 19.0, 'cartulina', 350,
     'cmyk', 'sin_impresion',
     true, false, true,
     7083, 4,
     52000, 35, 18200, 10, 7020, 1, 772, 78492, 0.0923,
     '2025-05-16', m_r1,
     true, true, true, true, true,
     'Barniz UV selectivo en portada. Hendido y troquelado Bobst.'),

    ('OT-2025-003', c_dist, 'Distribuidora Global',
     'Etiqueta precio promo supermercados — Línea Básica',
     5500000, 'completed',
     'Etiqueta Precio Promo', 'etiqueta', 'normal',
     4.0, 6.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     36667, 2,
     58000, 28, 16240, 10, 7424, 1, 817, 82481, 0.0150,
     '2025-05-30', m_r2,
     true, true, true, true, true,
     '2 colores (negro + rojo promo). Sin acabados especiales. Alto volumen.'),

    ('OT-2025-004', c_farma, 'Farmavida LTDA',
     'Etiqueta frasco jarabe pediátrico — PediVit C',
     380000, 'completed',
     'Etiqueta PediVit C 120ml', 'etiqueta', 'normal',
     5.0, 7.5, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     true, false, false,
     6333, 4,
     21000, 40, 8400, 10, 2940, 1, 323, 32663, 0.0860,
     '2025-05-19', m_r2,
     true, true, true, true, true,
     'Etiqueta farmacéutica. Colores calibrados Delta-E<2.'),

    ('OT-2025-005', c_norte, 'Comercial Norte S.A.',
     'Etiqueta frasco conserva tomate perita — Marca Casera',
     280000, 'completed',
     'Etiqueta Conserva Tomate 780g', 'etiqueta', 'normal',
     9.0, 12.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     14000, 4,
     17500, 40, 7000, 10, 2450, 1, 269, 27219, 0.0972,
     '2025-05-26', m_r2,
     true, true, true, true, true,
     NULL),

    ('OT-2025-006', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta botella vino Cabernet troquelado especial — Hacienda del Sur Reserve',
     180000, 'completed',
     'Etiqueta Vino Cabernet Reserve', 'etiqueta', 'alta', -- "alta" not enum but used as alta
     9.5, 14.0, 'couche', 150,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     13500, 5,
     22000, 45, 9900, 10, 3190, 1, 351, 35441, 0.1969,
     '2025-05-22', m_r1,
     true, true, true, true, true,
     'Troquelado forma botella. Laminado mate. Pantone 4695C (marrón premium).'),

    ('OT-2025-007', c_expr, 'Express Retail S.A.',
     'Etiqueta oferta electrónica — 30% Dcto. Línea Electro',
     420000, 'completed',
     'Etiqueta Oferta Electro 30%', 'etiqueta', 'alta',
     5.5, 8.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     8400, 3,
     19000, 40, 7600, 10, 2660, 1, 293, 29553, 0.0703,
     '2025-05-14', m_r2,
     true, true, true, true, true,
     'Urgente — campaña retail flash.'),

  -- ══════════════════════════════════════════════════════════
  -- JUNE 2025 — NORMAL  (~$278K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2025-008', c_label, 'LabelCorp S.A.',
     'Etiqueta blisters pastillas antialérgicas — AllerFree 10mg',
     2800000, 'completed',
     'Etiqueta AllerFree 10mg blister', 'etiqueta', 'normal',
     4.5, 3.5, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     18667, 4,
     55000, 30, 16500, 10, 7150, 1, 787, 79437, 0.0284,
     '2025-06-20', m_r1,
     true, true, true, true, true,
     'Pantone 485C. Pequeño formato. Tiraje alto. Lote certif.'),

    ('OT-2025-009', c_pack, 'PackBrands Ltda.',
     'Etiqueta shampoo fuerza y brillo 400ml — ShineMax Pro',
     1200000, 'completed',
     'Etiqueta ShineMax Pro 400ml', 'etiqueta', 'normal',
     8.5, 12.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     34286, 4,
     61000, 35, 21350, 10, 8235, 1, 905, 91490, 0.0762,
     '2025-06-13', m_r1,
     true, true, true, true, true,
     'Laminado brillante. Troquelado redondeado. Pantone 375C (verde).'),

    ('OT-2025-010', c_dist, 'Distribuidora Global',
     'Etiqueta congelados pollo trozado — Línea Congelados',
     4200000, 'completed',
     'Etiqueta Congelados Pollo', 'etiqueta', 'normal',
     6.5, 4.5, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     25200, 2,
     45000, 28, 12600, 10, 5760, 1, 634, 63994, 0.0152,
     '2025-06-27', m_r2,
     true, true, true, true, true,
     'Arte aprobado con 6 días de retraso. Deadline ajustado.'),

    ('OT-2025-011', c_farma, 'Farmavida LTDA',
     'Etiqueta caja comprimidos antihipertensivo — CardioNorm 10',
     310000, 'completed',
     'Etiqueta CardioNorm 10mg', 'etiqueta', 'normal',
     6.0, 9.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     6200, 4,
     18500, 40, 7400, 10, 2590, 1, 285, 28775, 0.0928,
     '2025-06-11', m_r2,
     true, true, true, true, true,
     NULL),

    ('OT-2025-012', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta cerveza artesanal IPA — Patagonia Wild IPA',
     95000, 'completed',
     'Etiqueta Cerveza IPA 330ml', 'etiqueta', 'alta',
     7.0, 10.0, 'couche', 130,
     'cmyk_pantone', 'sin_impresion',
     true, false, true,
     5944, 5,
     19000, 45, 8550, 10, 2755, 1, 303, 30608, 0.3222,
     '2025-06-06', m_r1,
     true, true, true, true, true,
     'Barniz UV mate selectivo. Pantone 151C (naranja lupulo).'),

  -- ══════════════════════════════════════════════════════════
  -- JULY 2025 — MODERATE RAMP (~$291K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2025-013', c_label, 'LabelCorp S.A.',
     'Etiqueta ampolla inyectable analgésico — Dolorin 50mg/5ml',
     1900000, 'completed',
     'Etiqueta Dolorin 50mg ampolla', 'etiqueta', 'normal',
     4.0, 8.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     25333, 4,
     43000, 30, 12900, 10, 5590, 1, 615, 62105, 0.0327,
     '2025-07-18', m_r1,
     true, true, true, true, true,
     'Pantone 158C. Adhesivo de alta adherencia vidrio.'),

    ('OT-2025-014', c_pack, 'PackBrands Ltda.',
     'Caja plegadiza desodorante roll-on 75ml — FreshDay 24H',
     1400000, 'completed',
     'Caja FreshDay 24H 75ml', 'caja_plegadiza', 'normal',
     6.0, 10.5, 'cartulina', 300,
     'cmyk_pantone', 'sin_impresion',
     true, false, true,
     7778, 4,
     67000, 35, 23450, 10, 9045, 1, 995, 100490, 0.0718,
     '2025-07-11', m_r1,
     true, true, true, true, true,
     'Barniz UV total frente. Hendido + pegado. Pantone 279C.'),

    ('OT-2025-015', c_dist, 'Distribuidora Global',
     'Etiqueta bolsa papas fritas familiar — SnackLine 250g',
     6000000, 'completed',
     'Etiqueta SnackLine 250g', 'etiqueta', 'normal',
     8.0, 5.5, 'adhesivo', 60,
     '3_color', 'sin_impresion',
     false, false, false,
     36000, 3,
     65000, 28, 18200, 10, 8320, 1, 915, 92435, 0.0154,
     '2025-07-25', m_r2,
     true, true, true, true, true,
     'Arte aprobado con 8 días de retraso (crónico). Turno extendido requerido.'),

    ('OT-2025-016', c_norte, 'Comercial Norte S.A.',
     'Etiqueta botella aceite maíz 900ml — AceiteOro',
     195000, 'completed',
     'Etiqueta AceiteOro 900ml', 'etiqueta', 'normal',
     7.5, 11.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     7150, 4,
     13500, 40, 5400, 10, 1890, 1, 208, 21098, 0.1082,
     '2025-07-23', m_r2,
     true, true, true, true, true,
     NULL),

    ('OT-2025-017', c_expr, 'Express Retail S.A.',
     'Etiqueta promo back-to-school — Útiles Escolares',
     550000, 'completed',
     'Etiqueta Escolar 2026', 'etiqueta', 'alta',
     6.0, 4.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     11000, 3,
     22000, 40, 8800, 10, 3080, 1, 339, 34219, 0.0622,
     '2025-07-10', m_r2,
     true, true, true, true, true,
     'Campaña escolar agosto. Rush.'),

  -- ══════════════════════════════════════════════════════════
  -- AUGUST 2025 — CRUNCH Q1  (~$380K) ← 3 clients simultaneous
  -- All deadlines converge 11–22 Aug. Night shift activated.
  -- ══════════════════════════════════════════════════════════

    -- LabelCorp Q1 quarterly order (3.5M etiquetas)
    ('OT-2025-018', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q1 — Etiqueta NeuroCalm 50 (lote verano) 3.5M',
     3500000, 'completed',
     'Etiqueta NeuroCalm 50ml Q1', 'etiqueta', 'urgente',
     5.5, 9.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, false, false,
     46667, 4,
     78000, 30, 23400, 10, 10140, 1, 1115, 112655, 0.0322,
     '2025-08-15', m_r1,
     true, true, true, true, true,
     '⚠️ CRUNCH Q1. Deadline inamovible — farmacia exige entrega 15/08 para '
     'distribución nacional antes del 25/08. Turno noche activado.'),

    ('OT-2025-019', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q1 — Etiqueta AllerFree blister verano 2.8M',
     2800000, 'completed',
     'Etiqueta AllerFree Blister Q1', 'etiqueta', 'urgente',
     4.5, 3.5, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     18667, 4,
     65000, 30, 19500, 10, 8450, 1, 929, 93879, 0.0335,
     '2025-08-22', m_r1,
     true, true, true, true, true,
     '⚠️ CRUNCH Q1. Segunda OT LabelCorp en misma semana.'),

    -- PackBrands Q1 quarterly order (2.2M cajas)
    ('OT-2025-020', c_pack, 'PackBrands Ltda.',
     'PEDIDO TRIMESTRAL Q1 — Caja HogarMax Lavanda verano 2.2M',
     2200000, 'completed',
     'Caja HogarMax Lavanda Q1', 'caja_plegadiza', 'urgente',
     11.5, 19.0, 'cartulina', 350,
     'cmyk', 'sin_impresion',
     true, false, true,
     18333, 4,
     88000, 35, 30800, 10, 11880, 1, 1307, 132187, 0.0601,
     '2025-08-18', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q1. PackBrands entregó arte en 48h (sin problema). '
     'Requiere Ryobi #2 a tope.'),

    -- Distribuidora Global Q1 (5.5M etiquetas, arte llegó tarde OTRA VEZ)
    ('OT-2025-021', c_dist, 'Distribuidora Global',
     'PEDIDO TRIMESTRAL Q1 — Etiquetas Promo Verano 5.5M',
     5500000, 'completed',
     'Etiqueta Promo Verano Q1', 'etiqueta', 'urgente',
     4.0, 6.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     36667, 2,
     60000, 28, 16800, 10, 7680, 1, 845, 85325, 0.0155,
     '2025-08-22', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q1. Arte llegó 9 días tarde. Se renegoció deadline 22/08. '
     'Requiere turno noche Ryobi #2 para recuperar.'),

    -- Regular clients continue (smaller, squeezed around crunches)
    ('OT-2025-022', c_farma, 'Farmavida LTDA',
     'Etiqueta PediVit C lote regular agosto',
     320000, 'completed',
     'Etiqueta PediVit C Ago', 'etiqueta', 'normal',
     5.0, 7.5, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     true, false, false,
     5333, 4,
     17500, 40, 7000, 10, 2450, 1, 269, 27219, 0.0851,
     '2025-08-08', m_r2,
     true, true, true, true, true,
     'Programada primera semana antes del crunch.'),

    ('OT-2025-023', c_norte, 'Comercial Norte S.A.',
     'Etiqueta conserva choclo — Marca Casera',
     240000, 'completed',
     'Etiqueta Conserva Choclo 410g', 'etiqueta', 'normal',
     9.0, 12.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     12000, 4,
     14800, 40, 5920, 10, 2072, 1, 228, 23020, 0.0959,
     '2025-08-06', m_r2,
     true, true, true, true, true,
     NULL),

  -- ══════════════════════════════════════════════════════════
  -- SEPTEMBER 2025 — POST-CRUNCH RECOVERY (~$278K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2025-024', c_label, 'LabelCorp S.A.',
     'Etiqueta suero fisiológico 500ml — SeruNorm',
     1600000, 'completed',
     'Etiqueta SeruNorm 500ml', 'etiqueta', 'normal',
     7.0, 10.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     21333, 4,
     38000, 30, 11400, 10, 4940, 1, 543, 54883, 0.0343,
     '2025-09-19', m_r1,
     true, true, true, true, true,
     'Post-crunch. Pantone 300C.'),

    ('OT-2025-025', c_pack, 'PackBrands Ltda.',
     'Etiqueta crema corporal hidratante 200ml — BodyLux Aloe',
     980000, 'completed',
     'Etiqueta BodyLux Aloe 200ml', 'etiqueta', 'normal',
     7.5, 11.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     26133, 4,
     53000, 35, 18550, 10, 7155, 1, 787, 79492, 0.0811,
     '2025-09-12', m_r1,
     true, true, true, true, true,
     NULL),

    ('OT-2025-026', c_dist, 'Distribuidora Global',
     'Etiqueta yogur bebible frutilla 1L — línea regular',
     3800000, 'completed',
     'Etiqueta Yogur Bebible Frutilla', 'etiqueta', 'normal',
     5.0, 7.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     22750, 2,
     40000, 28, 11200, 10, 5120, 1, 563, 56883, 0.0150,
     '2025-09-26', m_r2,
     true, true, true, true, true,
     'Arte aprobado con 5 días retraso (normal para Distrib.).'),

    ('OT-2025-027', c_farma, 'Farmavida LTDA',
     'Etiqueta cápsula blanda Omega 3 1000mg — OmegaLife',
     290000, 'completed',
     'Etiqueta OmegaLife 1000mg', 'etiqueta', 'normal',
     6.0, 9.0, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     false, false, false,
     5800, 4,
     17000, 40, 6800, 10, 2380, 1, 262, 26442, 0.0911,
     '2025-09-15', m_r2,
     true, true, true, true, true,
     NULL),

    ('OT-2025-028', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta vino Merlot cosecha 2024 — Hacienda del Sur Signature',
     145000, 'completed',
     'Etiqueta Merlot 2024 Signature', 'etiqueta', 'alta',
     9.5, 14.0, 'couche', 150,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     10357, 5,
     18500, 45, 8325, 10, 2683, 1, 295, 29803, 0.2055,
     '2025-09-08', m_r1,
     true, true, true, true, true,
     'Pantone 4975C. Laminado mate. Arte diseñado en casa.'),

    ('OT-2025-029', c_expr, 'Express Retail S.A.',
     'Etiqueta campaña fiestas patrias — Promo 18 Sep',
     380000, 'completed',
     'Etiqueta Fiestas Patrias', 'etiqueta', 'urgente',
     5.0, 7.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     7600, 3,
     16000, 40, 6400, 10, 2240, 1, 246, 24886, 0.0655,
     '2025-09-10', m_r2,
     true, true, true, true, true,
     'Urgente por campaña 18 sept.'),

  -- ══════════════════════════════════════════════════════════
  -- OCTOBER 2025 — STEADY  (~$267K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2025-030', c_label, 'LabelCorp S.A.',
     'Etiqueta pastilla vitamina C 1000mg — VitaMax C',
     2100000, 'completed',
     'Etiqueta VitaMax C 1000mg', 'etiqueta', 'normal',
     4.5, 7.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     14000, 4,
     48000, 30, 14400, 10, 6240, 1, 686, 69326, 0.0330,
     '2025-10-17', m_r1,
     true, true, true, true, true,
     'Pantone 137C (amarillo vitamina).'),

    ('OT-2025-031', c_pack, 'PackBrands Ltda.',
     'Caja plegadiza protector solar SPF 50 100ml — SunShield Pro',
     760000, 'completed',
     'Caja SunShield Pro SPF50', 'caja_plegadiza', 'normal',
     8.0, 14.0, 'cartulina', 300,
     'cmyk_pantone', 'sin_impresion',
     true, false, true,
     6333, 4,
     59000, 35, 20650, 10, 7965, 1, 876, 88491, 0.1164,
     '2025-10-10', m_r1,
     true, true, true, true, true,
     'Temporada UV. Barniz UV selectivo. Pantone 130C.'),

    ('OT-2025-032', c_dist, 'Distribuidora Global',
     'Etiqueta leche UHT entera 1L — MarcaOro',
     4500000, 'completed',
     'Etiqueta Leche UHT 1L', 'etiqueta', 'normal',
     8.0, 12.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     27000, 2,
     47000, 28, 13160, 10, 6016, 1, 662, 66838, 0.0148,
     '2025-10-31', m_r2,
     true, true, true, true, true,
     'Arte llegó 7 días tarde. Deadline movido al 31/10.'),

    ('OT-2025-033', c_norte, 'Comercial Norte S.A.',
     'Etiqueta frasco mermelada 400g — Sabores del Campo',
     175000, 'completed',
     'Etiqueta Mermelada 400g', 'etiqueta', 'normal',
     7.0, 9.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     5250, 4,
     12000, 40, 4800, 10, 1680, 1, 185, 18665, 0.1067,
     '2025-10-20', m_r2,
     true, true, true, true, true,
     NULL),

  -- ══════════════════════════════════════════════════════════
  -- NOVEMBER 2025 — CRUNCH Q2  (~$362K)
  -- Carlos en licencia → Jorge+Luis cubren Ryobi #1
  -- ══════════════════════════════════════════════════════════

    -- LabelCorp Q2 quarterly (4M etiquetas)
    ('OT-2025-034', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q2 — Etiqueta NeuroCalm lote invierno 4M',
     4000000, 'completed',
     'Etiqueta NeuroCalm Q2 Invierno', 'etiqueta', 'urgente',
     5.5, 9.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, false, false,
     53333, 4,
     88000, 30, 26400, 10, 11440, 1, 1258, 127098, 0.0318,
     '2025-11-14', m_r1,
     true, true, true, true, true,
     '⚠️ CRUNCH Q2. Carlos en licencia médica 10–21 Nov. '
     'Jorge opera Ryobi #1. Luis en Ryobi #2. Supervisor Eduardo en planta 12h/día.'),

    ('OT-2025-035', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q2 — Etiqueta VitaMax C lote invierno 2.5M',
     2500000, 'completed',
     'Etiqueta VitaMax C Q2', 'etiqueta', 'urgente',
     4.5, 7.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     16667, 4,
     58000, 30, 17400, 10, 7540, 1, 829, 83769, 0.0335,
     '2025-11-21', m_r1,
     true, true, true, true, true,
     '⚠️ CRUNCH Q2. Segunda OT LabelCorp. Deadline ajustado.'),

    -- PackBrands Q2 (2M cajas + etiquetas)
    ('OT-2025-036', c_pack, 'PackBrands Ltda.',
     'PEDIDO TRIMESTRAL Q2 — ShineMax Pro lote invierno 2M',
     2000000, 'completed',
     'Etiqueta ShineMax Pro Q2', 'etiqueta', 'urgente',
     8.5, 12.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     57143, 4,
     95000, 35, 33250, 10, 12825, 1, 1410, 142485, 0.0712,
     '2025-11-19', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q2. Ryobi #2 a capacidad máxima.'),

    -- Distribuidora Q2 (6M etiquetas, arte tarde)
    ('OT-2025-037', c_dist, 'Distribuidora Global',
     'PEDIDO TRIMESTRAL Q2 — Etiquetas Promo Navidad 6M',
     6000000, 'completed',
     'Etiqueta Promo Navidad Q2', 'etiqueta', 'urgente',
     4.0, 6.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     40000, 2,
     65000, 28, 18200, 10, 8320, 1, 915, 92435, 0.0154,
     '2025-11-28', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q2. Arte llegó 10 días tarde — 5 nov en vez de 25 oct. '
     'Deadline negociado al 28/11. Turno noche 18:00–02:00 activado toda la semana.'),

    ('OT-2025-038', c_farma, 'Farmavida LTDA',
     'Etiqueta CardioNorm lote noviembre',
     340000, 'completed',
     'Etiqueta CardioNorm Nov', 'etiqueta', 'normal',
     6.0, 9.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     6800, 4,
     19500, 40, 7800, 10, 2730, 1, 300, 30330, 0.0892,
     '2025-11-07', m_r2,
     true, true, true, true, true,
     'Semana 1 nov. Antes del crunch peak.'),

  -- ══════════════════════════════════════════════════════════
  -- DECEMBER 2025 — HOLIDAY SLOWDOWN  (~$198K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2025-039', c_pack, 'PackBrands Ltda.',
     'Caja navideña edición limitada FreshDay — Pack Regalo',
     450000, 'completed',
     'Caja Regalo FreshDay Navidad', 'caja_plegadiza', 'alta',
     15.0, 22.0, 'cartulina', 400,
     'cmyk_pantone', 'sin_impresion',
     true, false, true,
     6250, 5,
     48000, 35, 16800, 10, 6480, 1, 713, 72093, 0.1602,
     '2025-12-10', m_r1,
     true, true, true, true, true,
     'Edición navideña. Barniz UV. Pantone 187C (rojo navidad).'),

    ('OT-2025-040', c_label, 'LabelCorp S.A.',
     'Etiqueta vitaminas navideñas — NeuroCalm Edición Especial',
     800000, 'completed',
     'Etiqueta NeuroCalm Navidad', 'etiqueta', 'normal',
     5.5, 9.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     10667, 4,
     22000, 30, 6600, 10, 2860, 1, 315, 31775, 0.0397,
     '2025-12-05', m_r1,
     true, true, true, true, true,
     'Tiraje reducido. Diciembre lento.'),

    ('OT-2025-041', c_dist, 'Distribuidora Global',
     'Etiqueta panetón navideño 500g — Línea Premium Navidad',
     2200000, 'completed',
     'Etiqueta Panetón Premium 500g', 'etiqueta', 'normal',
     8.0, 12.0, 'adhesivo', 60,
     '3_color', 'sin_impresion',
     false, false, false,
     13200, 3,
     33000, 28, 9240, 10, 4224, 1, 465, 46929, 0.0213,
     '2025-12-12', m_r2,
     true, true, true, true, true,
     'Arte llegó a tiempo (excepción navideña). 3 colores festivos.'),

    ('OT-2025-042', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta espumante navideño — Hacienda del Sur Brut Reserva',
     85000, 'completed',
     'Etiqueta Espumante Brut Navidad', 'etiqueta', 'alta',
     9.5, 14.0, 'couche', 150,
     'cmyk_pantone', 'sin_impresion',
     true, false, false,
     6071, 5,
     16000, 45, 7200, 10, 2320, 1, 255, 25775, 0.3032,
     '2025-12-08', m_r1,
     true, true, true, true, true,
     'Hot stamping dorado. Pantone 872C.'),

    ('OT-2025-043', c_expr, 'Express Retail S.A.',
     'Etiqueta promo navidad-año nuevo retail',
     310000, 'completed',
     'Etiqueta Promo Nav-AñoNuevo', 'etiqueta', 'normal',
     5.0, 7.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     6200, 3,
     13000, 40, 5200, 10, 1820, 1, 200, 20220, 0.0652,
     '2025-12-17', m_r2,
     true, true, true, true, true,
     NULL),

  -- ══════════════════════════════════════════════════════════
  -- JANUARY 2026 — SLOW RESTART  (~$221K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2026-001', c_label, 'LabelCorp S.A.',
     'Etiqueta Dolorin ampolla lote enero',
     1500000, 'completed',
     'Etiqueta Dolorin Ene 2026', 'etiqueta', 'normal',
     4.0, 8.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     20000, 4,
     34000, 30, 10200, 10, 4420, 1, 486, 49106, 0.0327,
     '2026-01-23', m_r1,
     true, true, true, true, true,
     'Ramp-up enero.'),

    ('OT-2026-002', c_pack, 'PackBrands Ltda.',
     'Etiqueta BodyLux 200ml lote verano 2026',
     890000, 'completed',
     'Etiqueta BodyLux Verano 2026', 'etiqueta', 'normal',
     7.5, 11.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     23733, 4,
     48000, 35, 16800, 10, 6480, 1, 713, 72093, 0.0810,
     '2026-01-16', m_r1,
     true, true, true, true, true,
     NULL),

    ('OT-2026-003', c_dist, 'Distribuidora Global',
     'Etiqueta refresco naranja 1.5L — Línea Enero',
     3200000, 'completed',
     'Etiqueta Refresco Naranja 1.5L', 'etiqueta', 'normal',
     7.0, 10.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     19200, 2,
     34000, 28, 9520, 10, 4352, 1, 479, 48351, 0.0151,
     '2026-01-30', m_r2,
     true, true, true, true, true,
     'Arte con 7 días retraso. Deadline movido.'),

    ('OT-2026-004', c_farma, 'Farmavida LTDA',
     'Etiqueta PediVit C enero 2026',
     300000, 'completed',
     'Etiqueta PediVit C Ene26', 'etiqueta', 'normal',
     5.0, 7.5, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     true, false, false,
     5000, 4,
     16000, 40, 6400, 10, 2240, 1, 246, 24886, 0.0829,
     '2026-01-14', m_r2,
     true, true, true, true, true,
     'Patricia en vacaciones — Andrea cubre pre-prensa.'),

    ('OT-2026-005', c_norte, 'Comercial Norte S.A.',
     'Etiqueta frasco tomate natural 400g',
     160000, 'completed',
     'Etiqueta Tomate Natural 400g', 'etiqueta', 'normal',
     7.0, 10.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     4800, 4,
     11000, 40, 4400, 10, 1540, 1, 169, 17109, 0.1069,
     '2026-01-21', m_r2,
     true, true, true, true, true,
     NULL),

  -- ══════════════════════════════════════════════════════════
  -- FEBRUARY 2026 — GROWING  (~$269K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2026-006', c_label, 'LabelCorp S.A.',
     'Etiqueta SeruNorm suero feb 2026',
     1800000, 'completed',
     'Etiqueta SeruNorm Feb26', 'etiqueta', 'normal',
     7.0, 10.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     24000, 4,
     41000, 30, 12300, 10, 5330, 1, 586, 59216, 0.0329,
     '2026-02-20', m_r1,
     true, true, true, true, true,
     NULL),

    ('OT-2026-007', c_pack, 'PackBrands Ltda.',
     'Caja SunShield Pro SPF 50+ lote verano 2026',
     820000, 'completed',
     'Caja SunShield Pro Verano 26', 'caja_plegadiza', 'normal',
     8.0, 14.0, 'cartulina', 300,
     'cmyk_pantone', 'sin_impresion',
     true, false, true,
     6833, 4,
     63000, 35, 22050, 10, 8505, 1, 936, 94491, 0.1152,
     '2026-02-13', m_r1,
     true, true, true, true, true,
     'Temporada verano. Barniz UV.'),

    ('OT-2026-008', c_dist, 'Distribuidora Global',
     'Etiqueta agua mineral 600ml — Pureza Natural',
     5000000, 'completed',
     'Etiqueta Agua Mineral 600ml', 'etiqueta', 'normal',
     5.5, 8.5, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     30000, 2,
     52000, 28, 14560, 10, 6656, 1, 732, 73948, 0.0148,
     '2026-02-27', m_r2,
     true, true, true, true, true,
     'Arte con 6 días retraso.'),

    ('OT-2026-009', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta vino rosé — Hacienda del Sur Rosé Fresco',
     110000, 'completed',
     'Etiqueta Rosé Fresco', 'etiqueta', 'alta',
     9.5, 14.0, 'couche', 150,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     7857, 5,
     17500, 45, 7875, 10, 2538, 1, 279, 28192, 0.2563,
     '2026-02-09', m_r1,
     true, true, true, true, true,
     'Pantone 232C (rosa). Laminado mate.'),

    ('OT-2026-010', c_expr, 'Express Retail S.A.',
     'Etiqueta promo San Valentín retail',
     290000, 'completed',
     'Etiqueta San Valentín', 'etiqueta', 'urgente',
     5.0, 7.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     5800, 3,
     14000, 40, 5600, 10, 1960, 1, 216, 21776, 0.0751,
     '2026-02-06', m_r2,
     true, true, true, true, true,
     'Rush San Valentín.'),

  -- ══════════════════════════════════════════════════════════
  -- MARCH 2026 — CRUNCH Q3 + RYOBI #1 BREAKDOWN  (~$375K)
  -- Days 11–13 Mar: Ryobi #1 bearing failure. Ryobi #2 absorbs load.
  -- Emergency outsourcing: 2 OTs sent to external printer.
  -- ══════════════════════════════════════════════════════════

    -- LabelCorp Q3 (3.8M etiquetas) — starts before breakdown
    ('OT-2026-011', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q3 — NeuroCalm lote primavera 3.8M',
     3800000, 'completed',
     'Etiqueta NeuroCalm Q3 Primavera', 'etiqueta', 'urgente',
     5.5, 9.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, false, false,
     50667, 4,
     85000, 30, 25500, 10, 11050, 1, 1215, 122765, 0.0323,
     '2026-03-13', m_r1,
     true, true, true, true, true,
     '⚠️ CRUNCH Q3. OT PARCIALMENTE AFECTADA POR AVERÍA. '
     'Ryobi #1 falla cojinete 11/03. 30% producción redirigida a Ryobi #2. '
     'Deadline extendido a 13/03 con cliente. Jorge trabaja 12h en Ryobi #2.'),

    ('OT-2026-012', c_label, 'LabelCorp S.A.',
     'PEDIDO TRIMESTRAL Q3 — AllerFree blister primavera 3M',
     3000000, 'completed',
     'Etiqueta AllerFree Q3', 'etiqueta', 'urgente',
     4.5, 3.5, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     20000, 4,
     71000, 30, 21300, 10, 9230, 1, 1015, 102545, 0.0342,
     '2026-03-20', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q3. Toda la producción en Ryobi #2. Carlos regresó. Turno doble.'),

    -- PackBrands Q3 (2.4M) — outsourced 600K while Ryobi #1 down
    ('OT-2026-013', c_pack, 'PackBrands Ltda.',
     'PEDIDO TRIMESTRAL Q3 — HogarMax Lavanda primavera 2.4M',
     2400000, 'completed',
     'Caja HogarMax Lavanda Q3', 'caja_plegadiza', 'urgente',
     11.5, 19.0, 'cartulina', 350,
     'cmyk', 'sin_impresion',
     true, false, true,
     20000, 4,
     96000, 35, 33600, 10, 12960, 1, 1426, 144186, 0.0601,
     '2026-03-19', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q3. 600K unidades subcontratadas a Imprenta Veloz Ltda. '
     'por avería Ryobi #1 días 11–13 Mar. Costo subcontrato: $2.800 extra.'),

    -- Distribuidora Q3 (5.8M, arte llegó 9 días tarde, deadline crítico)
    ('OT-2026-014', c_dist, 'Distribuidora Global',
     'PEDIDO TRIMESTRAL Q3 — Etiquetas Promo Primavera 5.8M',
     5800000, 'completed',
     'Etiqueta Promo Primavera Q3', 'etiqueta', 'urgente',
     4.0, 6.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     38667, 2,
     63000, 28, 17640, 10, 8064, 1, 887, 89591, 0.0155,
     '2026-03-27', m_r2,
     true, true, true, true, true,
     '⚠️ CRUNCH Q3. Arte llegó 9 días tarde + avería. '
     'Renegociado a 27/03. Turnos extendidos semana del 18/03. '
     'TINKER: cambiar deadline a 20/03 y ver cómo el sistema marca el OT como atrasado.'),

    ('OT-2026-015', c_farma, 'Farmavida LTDA',
     'Etiqueta OmegaLife 1000mg lote marzo',
     310000, 'completed',
     'Etiqueta OmegaLife Mar26', 'etiqueta', 'normal',
     6.0, 9.0, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     false, false, false,
     5167, 4,
     17500, 40, 7000, 10, 2450, 1, 269, 27219, 0.0878,
     '2026-03-06', m_r1,
     true, true, true, true, true,
     'Pre-crunch semana 1 marzo.'),

    ('OT-2026-016', c_norte, 'Comercial Norte S.A.',
     'Etiqueta aceite maíz 900ml lote marzo',
     190000, 'completed',
     'Etiqueta AceiteOro Mar26', 'etiqueta', 'normal',
     7.5, 11.0, 'couche', 115,
     'cmyk', 'sin_impresion',
     false, false, false,
     6967, 4,
     13200, 40, 5280, 10, 1848, 1, 203, 20531, 0.1081,
     '2026-03-04', m_r2,
     true, true, true, true, true,
     NULL),

  -- ══════════════════════════════════════════════════════════
  -- APRIL 2026 — RECOVERY  (~$271K)
  -- ══════════════════════════════════════════════════════════

    ('OT-2026-017', c_label, 'LabelCorp S.A.',
     'Etiqueta Dolorin ampolla lote abril',
     1700000, 'completed',
     'Etiqueta Dolorin Abr26', 'etiqueta', 'normal',
     4.0, 8.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     false, false, false,
     22667, 4,
     39000, 30, 11700, 10, 5070, 1, 558, 56328, 0.0331,
     '2026-04-17', m_r1,
     true, true, true, true, true,
     'Post-crunch Q3. Ryobi #1 100% operativa.'),

    ('OT-2026-018', c_pack, 'PackBrands Ltda.',
     'Etiqueta crema nutritiva 200ml — SkinLux Omega',
     950000, 'completed',
     'Etiqueta SkinLux Omega 200ml', 'etiqueta', 'normal',
     7.5, 11.0, 'adhesivo', 80,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     25333, 4,
     55000, 35, 19250, 10, 7425, 1, 817, 82492, 0.0868,
     '2026-04-10', m_r1,
     true, true, true, true, true,
     NULL),

    ('OT-2026-019', c_dist, 'Distribuidora Global',
     'Etiqueta mayonesa 500g — Línea Fácil',
     4100000, 'completed',
     'Etiqueta Mayonesa 500g', 'etiqueta', 'normal',
     6.0, 8.0, 'adhesivo', 60,
     '2_color', 'sin_impresion',
     false, false, false,
     24600, 2,
     44000, 28, 12320, 10, 5632, 1, 620, 62572, 0.0153,
     '2026-04-24', m_r2,
     true, true, true, true, true,
     'Arte con 5 días retraso. Normal para Distrib.'),

    ('OT-2026-020', c_farma, 'Farmavida LTDA',
     'Etiqueta PediVit C lote otoño',
     330000, 'completed',
     'Etiqueta PediVit C Abr26', 'etiqueta', 'normal',
     5.0, 7.5, 'adhesivo', 80,
     'cmyk', 'sin_impresion',
     true, false, false,
     5500, 4,
     18000, 40, 7200, 10, 2520, 1, 277, 27997, 0.0848,
     '2026-04-09', m_r2,
     true, true, true, true, true,
     NULL),

    ('OT-2026-021', c_sur, 'Inversiones del Sur Ltda.',
     'Etiqueta vino Pinot Noir otoño — Hacienda del Sur Otoño',
     125000, 'completed',
     'Etiqueta Pinot Noir Otoño', 'etiqueta', 'alta',
     9.5, 14.0, 'couche', 150,
     'cmyk_pantone', 'sin_impresion',
     true, true, false,
     8929, 5,
     19500, 45, 8775, 10, 2828, 1, 311, 31414, 0.2513,
     '2026-04-07', m_r1,
     true, true, true, true, true,
     'Pantone 229C (violeta). Laminado mate. Otoño colección.'),

    ('OT-2026-022', c_expr, 'Express Retail S.A.',
     'Etiqueta promo otoño — Línea Jardín Express',
     260000, 'completed',
     'Etiqueta Promo Otoño Jardín', 'etiqueta', 'normal',
     6.0, 4.0, 'adhesivo', 70,
     '3_color', 'sin_impresion',
     false, false, false,
     5200, 3,
     11500, 40, 4600, 10, 1610, 1, 177, 17887, 0.0688,
     '2026-04-22', m_r2,
     true, true, true, true, true,
     NULL)

  ON CONFLICT (ot_number) DO NOTHING;

  -- ── OT Operations (cost breakdown lines) ─────────────────
  -- We add operations for every OT using a set of standard line items.
  -- TINKER TIP: Add a new row to ot_operations for an OT and watch
  -- the subtotal and margin auto-recalculate on the financial dashboard.
  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order)
  SELECT o.id, v.cat::public.ot_operation_category, v.name, v.unit, v.qty, v.uc, v.sort
  FROM public.ots o
  CROSS JOIN (VALUES
    ('materiales',    'Sustrato / Papel',         'kg',     0.0, 1.80,  10),
    ('materiales',    'Tintas CMYK',               'kg',     0.0, 12.50, 20),
    ('materiales',    'Planchas CTP',              'unit',   0.0, 18.00, 30),
    ('impresion',     'Impresión Offset',          'hours',  0.0, 45.00, 40),
    ('terminaciones', 'Troquelado',                'hours',  0.0, 30.00, 50),
    ('terminaciones', 'Guillotina / Corte',        'hours',  0.0, 20.00, 60),
    ('terminaciones', 'Terminaciones Manuales',    'hours',  0.0, 12.00, 70),
    ('otros',         'Embalaje y Despacho',       'unit',   1.0, 85.00, 80)
  ) AS v(cat, name, unit, qty, uc, sort)
  WHERE o.ot_number LIKE 'OT-202%'
    AND NOT EXISTS (
      SELECT 1 FROM public.ot_operations op WHERE op.ot_id = o.id LIMIT 1
    );

  -- ── OT Financials (one row per OT) ───────────────────────
  -- Costs are approximated from the total_price and standard margin structure.
  -- TINKER TIP: Decrease revenue on a crunch OT to see how the profit
  -- metric and color indicators change on the financial module.
  INSERT INTO public.ot_financials (ot_id, material_cost, labor_cost, machine_cost,
    overhead_cost, revenue, notes)
  SELECT
    o.id,
    ROUND(o.total_price * 0.32, 2),   -- ~32% materials
    ROUND(o.total_price * 0.22, 2),   -- ~22% labor
    ROUND(o.total_price * 0.10, 2),   -- ~10% machine
    ROUND(o.total_price * 0.08, 2),   -- ~8% overhead
    o.total_price,
    'Auto-calculado desde total_price de OT. Ajustar con costos reales via ot_real_costs.'
  FROM public.ots o
  WHERE o.ot_number LIKE 'OT-202%'
    AND NOT EXISTS (
      SELECT 1 FROM public.ot_financials f WHERE f.ot_id = o.id
    );

END $$;

-- ── OT State Transitions (audit trail) ───────────────────────
-- Shows the workflow progression for a sample of OTs
INSERT INTO ot_state_transitions (ot_id, from_status, to_status, reason, created_at)
SELECT o.id,
       'pre_press'::public.ot_status,
       'offset_printing'::public.ot_status,
       'Pre-prensa aprobada. Pasando a impresión.',
       o.created_at + interval '1 day'
FROM public.ots o
WHERE o.ot_number IN ('OT-2025-018','OT-2025-020','OT-2025-021',
                       'OT-2026-011','OT-2026-013','OT-2026-014')
ON CONFLICT DO NOTHING;

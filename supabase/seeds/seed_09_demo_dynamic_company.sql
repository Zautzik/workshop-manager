-- ============================================================
-- SEED 09 — Dynamic company demo (CLP scale)
--
-- Replaces the small-scale demo numbers with a realistic Chilean press:
--   • 3 anchor clients (LabelCorp · PackBrands · Distribuidora) that each drop
--     a HUGE load roughly every 2–3 weeks — the defining rhythm of the shop.
--   • ~$300.000.000 CLP revenue per month (whole pesos — CLP has no decimals).
--   • Correlative OT numbers ending at OT-40500 ("we're around 40500").
--   • A live June pipeline (some OTs still in production) so the Tablero and
--     charts show movement, not just history.
--
-- Run order: AFTER seed_03 (clients). Depends on the production_detail migration
-- only being harmless (not required here).
-- Safe to re-run: YES (junk delete is idempotent; inserts use ON CONFLICT).
--
-- NOTE: new OTs are numbered correlatively from the max existing ot_number.
-- If `generate_ot_number` uses a separate sequence, bump it to 40501 so the
-- next created OT continues the run.
-- ============================================================

-- ── 0. Purge junk / test OTs ─────────────────────────────────
-- The Tablero showed test rubbish (saad, ffdfs, ffssdf, fdf, raw digit codes).
-- Delete their child rows first (no reliance on FK cascade), then the OTs.
DO $$
DECLARE
  junk UUID[];
BEGIN
  SELECT array_agg(id) INTO junk
  FROM public.ots
  WHERE ot_number   ILIKE ANY (ARRAY['saad%','ffdfs%','ffssdf%','fdf%','test%','22123%','43425%'])
     OR product_name ILIKE ANY (ARRAY['saad%','ffdfs%','ffssdf%','fdf%','test%'])
     OR client_name  ILIKE ANY (ARRAY['saad%','ffdfs%','fdf%','test%']);

  IF junk IS NOT NULL THEN
    DELETE FROM public.ot_operations      WHERE ot_id = ANY(junk);
    DELETE FROM public.ot_financials       WHERE ot_id = ANY(junk);
    DELETE FROM public.ot_state_transitions WHERE ot_id = ANY(junk);
    DELETE FROM public.ots                 WHERE id    = ANY(junk);
    RAISE NOTICE 'Deleted % junk OT(s).', array_length(junk, 1);
  END IF;
END $$;

-- ── 1. Demo OTs (CLP scale, correlative, bursty) ─────────────
DO $$
DECLARE
  c_label UUID; c_pack UUID; c_dist UUID;
  c_farma UUID; c_norte UUID; c_sur UUID; c_expr UUID;
BEGIN
  SELECT id INTO c_label FROM public.clients WHERE rut = '76.123.456-7' LIMIT 1;
  SELECT id INTO c_pack  FROM public.clients WHERE rut = '77.654.321-K' LIMIT 1;
  SELECT id INTO c_dist  FROM public.clients WHERE rut = '78.999.888-3' LIMIT 1;
  SELECT id INTO c_farma FROM public.clients WHERE rut = '76.445.112-5' LIMIT 1;
  SELECT id INTO c_norte FROM public.clients WHERE rut = '76.778.334-8' LIMIT 1;
  SELECT id INTO c_sur   FROM public.clients WHERE rut = '77.002.556-1' LIMIT 1;
  SELECT id INTO c_expr  FROM public.clients WHERE rut = '76.101.202-9' LIMIT 1;

  INSERT INTO public.ots
    (ot_number, client_id, client_name, description, quantity, status,
     product_name, product_type, priority_level, subtotal, margin_pct,
     total_price, deadline, created_at, notes)
  VALUES
  -- ══ APRIL 2026 — ~$295M  (LabelCorp burst, week of the 14th) ══
  ('OT-40481', c_label, 'LabelCorp S.A.', 'Lote trimestral etiquetas NeuroCalm — 3.5M', 3500000, 'completed',
    'Etiqueta NeuroCalm 50ml', 'etiqueta', 'urgente',  81900000, 30, 105000000, '2026-04-16', '2026-04-08',
    '⚡ CARGA GRANDE LabelCorp. Deadline fijo cadena farmacéutica. Turno noche activado.'),
  ('OT-40482', c_label, 'LabelCorp S.A.', 'Lote trimestral etiquetas AllerFree blister — 2.4M', 2400000, 'completed',
    'Etiqueta AllerFree Blister', 'etiqueta', 'urgente', 54600000, 30, 70000000, '2026-04-18', '2026-04-09',
    '⚡ Segundo lote LabelCorp en la misma semana (burst).'),
  ('OT-40483', c_farma, 'Farmavida LTDA', 'Etiqueta jarabe pediátrico PediVit C', 320000, 'completed',
    'Etiqueta PediVit C 120ml', 'etiqueta', 'normal', 17160000, 40, 22000000, '2026-04-11', '2026-04-03', NULL),
  ('OT-40484', c_norte, 'Comercial Norte S.A.', 'Etiqueta conserva tomate 780g', 280000, 'completed',
    'Etiqueta Conserva Tomate', 'etiqueta', 'normal', 14040000, 40, 18000000, '2026-04-22', '2026-04-14', NULL),
  ('OT-40485', c_expr, 'Express Retail S.A.', 'Etiqueta oferta electro 30% dcto', 420000, 'completed',
    'Etiqueta Oferta Electro', 'etiqueta', 'alta', 19500000, 40, 25000000, '2026-04-25', '2026-04-18', 'Campaña retail flash.'),
  ('OT-40486', c_sur, 'Inversiones del Sur Ltda.', 'Etiqueta vino Cabernet Reserve troquelado', 180000, 'completed',
    'Etiqueta Vino Cabernet', 'etiqueta', 'alta', 23400000, 45, 30000000, '2026-04-28', '2026-04-21',
    'Troquelado forma botella. Laminado mate. Pantone premium.'),
  ('OT-40487', c_pack, 'PackBrands Ltda.', 'Caja plegadiza desodorante FreshDay', 600000, 'completed',
    'Caja FreshDay 75ml', 'caja_plegadiza', 'normal', 19500000, 35, 25000000, '2026-04-30', '2026-04-23', NULL),

  -- ══ MAY 2026 — ~$302M  (Distribuidora burst ~5th, PackBrands burst ~28th) ══
  ('OT-40488', c_dist, 'Distribuidora Global', 'Pedido masivo etiquetas promo — 6M', 6000000, 'completed',
    'Etiqueta Promo Retail', 'etiqueta', 'urgente', 84240000, 28, 108000000, '2026-05-09', '2026-05-04',
    '⚡ CARGA GRANDE Distribuidora. Arte llegó 9 días tarde — deadline renegociado, turno noche.'),
  ('OT-40489', c_farma, 'Farmavida LTDA', 'Etiqueta CardioNorm comprimidos', 310000, 'completed',
    'Etiqueta CardioNorm', 'etiqueta', 'normal', 15600000, 40, 20000000, '2026-05-12', '2026-05-05', NULL),
  ('OT-40490', c_label, 'LabelCorp S.A.', 'Etiqueta suero SeruNorm 500ml', 1800000, 'completed',
    'Etiqueta SeruNorm 500ml', 'etiqueta', 'normal', 27300000, 30, 35000000, '2026-05-16', '2026-05-08', NULL),
  ('OT-40491', c_norte, 'Comercial Norte S.A.', 'Etiqueta conserva choclo 410g', 240000, 'completed',
    'Etiqueta Conserva Choclo', 'etiqueta', 'normal', 12480000, 40, 16000000, '2026-05-20', '2026-05-12', NULL),
  ('OT-40492', c_pack, 'PackBrands Ltda.', 'Pedido trimestral cajas HogarMax — 2.2M', 2200000, 'completed',
    'Caja HogarMax Lavanda', 'caja_plegadiza', 'urgente', 81900000, 35, 105000000, '2026-05-28', '2026-05-21',
    '⚡ CARGA GRANDE PackBrands. Barniz UV selectivo. Ryobi #2 a tope.'),
  ('OT-40493', c_expr, 'Express Retail S.A.', 'Etiqueta promo otoño retail', 300000, 'completed',
    'Etiqueta Promo Otoño', 'etiqueta', 'normal', 14040000, 40, 18000000, '2026-05-30', '2026-05-23', NULL),

  -- ══ JUNE 2026 — ~$299M  (LabelCorp burst ~13th; live pipeline at month end) ══
  ('OT-40494', c_label, 'LabelCorp S.A.', 'Pedido trimestral NeuroCalm primavera — 3.8M', 3800000, 'completed',
    'Etiqueta NeuroCalm Q', 'etiqueta', 'urgente', 85800000, 30, 110000000, '2026-06-13', '2026-06-04',
    '⚡ CARGA GRANDE LabelCorp. Pantone crítico 485C. Lote certificado.'),
  ('OT-40495', c_label, 'LabelCorp S.A.', 'Pedido trimestral AllerFree primavera — 2.5M', 2500000, 'completed',
    'Etiqueta AllerFree Q', 'etiqueta', 'urgente', 58500000, 30, 75000000, '2026-06-18', '2026-06-09',
    '⚡ Segundo lote LabelCorp (burst). Turno doble.'),
  ('OT-40496', c_farma, 'Farmavida LTDA', 'Etiqueta OmegaLife 1000mg', 340000, 'completed',
    'Etiqueta OmegaLife', 'etiqueta', 'normal', 17160000, 40, 22000000, '2026-06-07', '2026-06-01', NULL),
  ('OT-40497', c_norte, 'Comercial Norte S.A.', 'Etiqueta aceite maíz 900ml', 195000, 'offset_printing',
    'Etiqueta AceiteOro 900ml', 'etiqueta', 'normal', 10920000, 40, 14000000, '2026-06-26', '2026-06-18',
    'En prensa — Ryobi #2.'),
  ('OT-40498', c_expr, 'Express Retail S.A.', 'Etiqueta promo invierno electro', 420000, 'die_cutting',
    'Etiqueta Promo Invierno', 'etiqueta', 'alta', 18720000, 40, 24000000, '2026-06-28', '2026-06-20',
    'En troquelado.'),
  ('OT-40499', c_sur, 'Inversiones del Sur Ltda.', 'Etiqueta vino Pinot Noir otoño', 180000, 'visto_bueno',
    'Etiqueta Pinot Noir', 'etiqueta', 'alta', 21840000, 45, 28000000, '2026-06-30', '2026-06-23',
    'Esperando visto bueno del cliente.'),
  ('OT-40500', c_pack, 'PackBrands Ltda.', 'Caja protector solar SunShield SPF50', 760000, 'pre_press',
    'Caja SunShield Pro', 'caja_plegadiza', 'normal', 20280000, 35, 26000000, '2026-07-03', '2026-06-25',
    'En pre-prensa. Temporada verano.')
  ON CONFLICT (ot_number) DO NOTHING;

  -- ── OT Financials (revenue = total_price; costs as % — whole pesos) ──
  INSERT INTO public.ot_financials (ot_id, material_cost, labor_cost, machine_cost, overhead_cost, revenue, notes)
  SELECT o.id,
         ROUND(o.total_price * 0.32),  -- ~32% materials
         ROUND(o.total_price * 0.22),  -- ~22% labor
         ROUND(o.total_price * 0.10),  -- ~10% machine
         ROUND(o.total_price * 0.08),  -- ~8% overhead
         o.total_price,
         'Demo dinámico (CLP). Ajustar con costos reales vía ot_real_costs.'
  FROM public.ots o
  WHERE o.ot_number BETWEEN 'OT-40481' AND 'OT-40500'
    AND NOT EXISTS (SELECT 1 FROM public.ot_financials f WHERE f.ot_id = o.id);
END $$;

-- ── 2. Timezone-safe timestamps ──────────────────────────────
-- The dates above are bare (midnight UTC). In America/Santiago (UTC-4) a
-- midnight-UTC date falls on the PREVIOUS local day, so a day-1 OT buckets into
-- the wrong month and skews the monthly revenue total. Shift to noon UTC so the
-- calendar day is the same in any sane timezone. Idempotent (only midnight rows).
UPDATE public.ots
SET created_at = created_at + interval '12 hours'
WHERE ot_number BETWEEN 'OT-40481' AND 'OT-40500'
  AND created_at::time = '00:00:00';

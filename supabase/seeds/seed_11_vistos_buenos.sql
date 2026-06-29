-- ============================================================
-- SEED 11 — Vistos Buenos (the sales funnel)
--
-- A handful of quotes across the lifecycle so Comercial → Cotizaciones and the
-- manager Pipeline de Ventas are alive, and so a 'signed' one can be converted
-- to an OT live in the demo (quote → sign → one tap → OT in the ledger).
--
-- Run order: AFTER the C1 migrations (20260628140000 + 150000) and seed_03.
-- Safe to re-run: YES (clears its own VB-DEMO rows first).
-- ============================================================

DO $$
DECLARE
  c_label UUID; c_pack UUID; c_dist UUID; c_farma UUID;
  s_a UUID; s_b UUID;
BEGIN
  SELECT id INTO c_label FROM public.clients WHERE rut = '76.123.456-7' LIMIT 1;
  SELECT id INTO c_pack  FROM public.clients WHERE rut = '77.654.321-K' LIMIT 1;
  SELECT id INTO c_dist  FROM public.clients WHERE rut = '78.999.888-3' LIMIT 1;
  SELECT id INTO c_farma FROM public.clients WHERE rut = '76.445.112-5' LIMIT 1;

  SELECT id INTO s_a FROM public.employees WHERE full_name ILIKE 'Eduardo%'  LIMIT 1;
  SELECT id INTO s_b FROM public.employees WHERE full_name ILIKE 'Valentina%' LIMIT 1;

  -- Idempotency: clear prior demo VBs (by the demo notes tag).
  DELETE FROM public.vistos_buenos WHERE notes = 'seed_11_demo';

  INSERT INTO public.vistos_buenos
    (client_id, client_name, salesman_id, product_name, product_type, quantity,
     width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back, ink_coverage,
     estimate_lines, subtotal_cost, markup_pct, margin_pct, total_price, unit_price, floor_price,
     status, signed_at, valid_until, notes)
  VALUES
  -- DRAFT — being priced
  (c_label, 'LabelCorp S.A.', s_a, 'Etiqueta NeuroCalm 50ml — lote Q4', 'etiqueta', 2500000,
   5.5, 9.0, 'adhesivo', 80, '4', '0', 'medium',
   '[{"category":"material","description":"Sustrato / Papel","quantity":11400,"unit":"kg","unit_cost":1800},{"category":"material","description":"Tintas (cobertura medium)","quantity":760,"unit":"kg","unit_cost":31915},{"category":"machine","description":"Impresión Offset","quantity":280,"unit":"hours","unit_cost":25000}]'::jsonb,
   58000000, 35, 26, 78300000, 31.32, 63800000,
   'draft', NULL, current_date + 20, 'seed_11_demo'),

  -- SENT — awaiting client signature
  (c_pack, 'PackBrands Ltda.', s_b, 'Caja plegadiza HogarMax — premium', 'caja_plegadiza', 1800000,
   11.5, 19.0, 'cartulina', 350, '4', '0', 'heavy',
   '[{"category":"material","description":"Sustrato / Papel","quantity":42000,"unit":"kg","unit_cost":1800},{"category":"material","description":"Tintas (cobertura heavy)","quantity":2200,"unit":"kg","unit_cost":31915},{"category":"machine","description":"Impresión Offset","quantity":520,"unit":"hours","unit_cost":25000},{"category":"finishing","description":"Barniz UV + Terminación","quantity":260,"unit":"hours","unit_cost":22000}]'::jsonb,
   90000000, 35, 26, 121500000, 67.50, 99000000,
   'sent', NULL, current_date + 15, 'seed_11_demo'),

  -- SIGNED — ready to "Generar OT" live in the demo
  (c_dist, 'Distribuidora Global', s_a, 'Etiqueta Promo Verano — masivo', 'etiqueta', 5000000,
   4.0, 6.0, 'adhesivo', 60, '2', '0', 'light',
   '[{"category":"material","description":"Sustrato / Papel","quantity":24000,"unit":"kg","unit_cost":1800},{"category":"material","description":"Tintas (cobertura light)","quantity":420,"unit":"kg","unit_cost":31915},{"category":"machine","description":"Impresión Offset","quantity":600,"unit":"hours","unit_cost":25000}]'::jsonb,
   72000000, 28, 22, 92000000, 18.40, 79200000,
   'signed', now() - interval '1 day', current_date + 10, 'seed_11_demo'),

  -- SIGNED — second one ready to convert
  (c_farma, 'Farmavida LTDA', s_b, 'Etiqueta PediVit C — pediátrico', 'etiqueta', 400000,
   5.0, 7.5, 'adhesivo', 80, '4', '0', 'medium',
   '[{"category":"material","description":"Sustrato / Papel","quantity":1800,"unit":"kg","unit_cost":1800},{"category":"material","description":"Tintas (cobertura medium)","quantity":120,"unit":"kg","unit_cost":31915},{"category":"machine","description":"Impresión Offset","quantity":45,"unit":"hours","unit_cost":25000}]'::jsonb,
   12000000, 40, 28, 16800000, 42.00, 13200000,
   'signed', now() - interval '3 hours', current_date + 12, 'seed_11_demo');

  RAISE NOTICE 'seed_11 done: 4 Vistos Buenos seeded.';
END $$;

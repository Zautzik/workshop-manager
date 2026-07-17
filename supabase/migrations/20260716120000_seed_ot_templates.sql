-- ============================================================
-- P4.4 (demo-readiness plan §Phase 4) — seed the OT template catalog
--
-- The wizard's TemplateSelector queried an eternally-empty table: the
-- feature existed but was invisible (2026-07 audit — "empty selector with
-- no CTA"). Decision: fill it rather than delete it — templates are the
-- fastest path to a correct OT for the plant's three recurring products.
--
-- Rates mirror the cost catalog (Offset 4c $85.000/h, troquelado $25.000/h,
-- adhesivo $3.500/kg, cartulina 300g $2.800/kg, couché 130g $1.800/kg).
-- Config data, not demo data: guarded per-row so re-running never duplicates
-- and plant edits (via the templates API) are never overwritten.
-- ============================================================

INSERT INTO public.ot_templates
  (name, description, product_type, substrate_type, grammage_gsm,
   width_cm, height_cm, color_front, color_back, finishes, default_operations,
   margin_pct, increment_pct, commission_pct)
SELECT
  'Etiqueta de vino — adhesivo 90g',
  'Etiqueta autoadhesiva estándar de botella 750ml, 4/0 con barniz de protección.',
  'etiqueta', 'adhesivo', 90, 9.5, 12.0, 'cmyk', 'sin_impresion',
  '{"finish_barniz": true, "finish_troquelado": true}'::jsonb,
  '[{"category":"materiales","name":"Adhesivo blanco 90grs","unit":"kg","unit_cost":3500},
    {"category":"impresion","name":"Impresión Offset 4 colores","unit":"hrs","unit_cost":85000},
    {"category":"terminaciones","name":"Troquelado","unit":"hrs","unit_cost":25000},
    {"category":"terminaciones","name":"Barniz","unit":"hrs","unit_cost":3000}]'::jsonb,
  38, 10, 1
WHERE NOT EXISTS (SELECT 1 FROM public.ot_templates WHERE name = 'Etiqueta de vino — adhesivo 90g');

INSERT INTO public.ot_templates
  (name, description, product_type, substrate_type, grammage_gsm,
   width_cm, height_cm, color_front, color_back, finishes, default_operations,
   margin_pct, increment_pct, commission_pct)
SELECT
  'Caja plegadiza — cartulina 300g',
  'Caja plegadiza alimentaria, 4/0, troquelada y pegada (FSSC: exige lote certificado).',
  'caja_plegadiza', 'cartulina', 300, 24.0, 16.0, 'cmyk', 'sin_impresion',
  '{"finish_troquelado": true, "finish_pegado": true}'::jsonb,
  '[{"category":"materiales","name":"Cartulina 300grs","unit":"kg","unit_cost":2800},
    {"category":"impresion","name":"Impresión Offset 4 colores","unit":"hrs","unit_cost":85000},
    {"category":"terminaciones","name":"Troquelado","unit":"hrs","unit_cost":25000},
    {"category":"terminaciones","name":"Pegado automático","unit":"hrs","unit_cost":20000}]'::jsonb,
  35, 10, 1
WHERE NOT EXISTS (SELECT 1 FROM public.ot_templates WHERE name = 'Caja plegadiza — cartulina 300g');

INSERT INTO public.ot_templates
  (name, description, product_type, substrate_type, grammage_gsm,
   width_cm, height_cm, color_front, color_back, finishes, default_operations,
   margin_pct, increment_pct, commission_pct)
SELECT
  'Volante — couché 130g',
  'Volante promocional media carta, 4/4, corte final a guillotina.',
  'volante', 'couche', 130, 14.0, 21.5, 'cmyk', 'cmyk',
  '{}'::jsonb,
  '[{"category":"materiales","name":"Couché 130grs","unit":"kg","unit_cost":1800},
    {"category":"impresion","name":"Impresión Offset 4 colores (tiro/retiro)","unit":"hrs","unit_cost":85000},
    {"category":"terminaciones","name":"Corte final (guillotina)","unit":"hrs","unit_cost":18000}]'::jsonb,
  30, 10, 1
WHERE NOT EXISTS (SELECT 1 FROM public.ot_templates WHERE name = 'Volante — couché 130g');

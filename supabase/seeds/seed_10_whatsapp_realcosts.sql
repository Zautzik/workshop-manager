-- ============================================================
-- SEED 10 — WhatsApp → real-cost showcase (the funding money-shot)
--
-- Demonstrates the core thesis end to end: an operator sends a WhatsApp message,
-- it is parsed (with a confidence score), a supervisor approves it, and the cost
-- is INSTANTLY reflected in the OT's real costs → monthly cost figures.
--
-- Populates:
--   • whatsapp_production_logs  — active sessions, a live review queue, and
--     approved reports (with confidence) dated TODAY so the dashboard is alive.
--   • ot_real_costs             — costs that arrived via WhatsApp + consolidated
--     production costs for the month, so "Costos Reales" and the monthly cost
--     roll-up light up.
--   • ots.order_date            — enables the labor-margin date filter.
--
-- Run order: AFTER seed_09 (needs OT-40481..40500).
-- Safe to re-run: YES (clears its own rows by the +56 9 5xxx phone prefix /
-- operation_code, then re-inserts).
-- ============================================================

DO $$
DECLARE
  ot97 UUID; ot98 UUID; ot99 UUID; ot00 UUID;
  ot94 UUID; ot95 UUID; ot92 UUID; ot88 UUID; ot87 UUID;
  e_carlos UUID; e_jorge UUID; e_luis UUID; e_andrea UUID; e_miguel UUID;
  l UUID;
BEGIN
  SELECT id INTO ot97 FROM public.ots WHERE ot_number = 'OT-40497' LIMIT 1;
  SELECT id INTO ot98 FROM public.ots WHERE ot_number = 'OT-40498' LIMIT 1;
  SELECT id INTO ot99 FROM public.ots WHERE ot_number = 'OT-40499' LIMIT 1;
  SELECT id INTO ot00 FROM public.ots WHERE ot_number = 'OT-40500' LIMIT 1;
  SELECT id INTO ot94 FROM public.ots WHERE ot_number = 'OT-40494' LIMIT 1;
  SELECT id INTO ot95 FROM public.ots WHERE ot_number = 'OT-40495' LIMIT 1;
  SELECT id INTO ot92 FROM public.ots WHERE ot_number = 'OT-40492' LIMIT 1;
  SELECT id INTO ot88 FROM public.ots WHERE ot_number = 'OT-40488' LIMIT 1;
  SELECT id INTO ot87 FROM public.ots WHERE ot_number = 'OT-40487' LIMIT 1;

  SELECT id INTO e_carlos FROM public.employees WHERE full_name ILIKE 'Carlos%'   LIMIT 1;
  SELECT id INTO e_jorge  FROM public.employees WHERE full_name ILIKE 'Jorge%'    LIMIT 1;
  SELECT id INTO e_luis   FROM public.employees WHERE full_name ILIKE 'Luis%'     LIMIT 1;
  SELECT id INTO e_andrea FROM public.employees WHERE full_name ILIKE 'Andrea%'   LIMIT 1;
  SELECT id INTO e_miguel FROM public.employees WHERE full_name ILIKE 'Miguel%'   LIMIT 1;

  -- Idempotency
  DELETE FROM public.whatsapp_production_logs WHERE operator_phone LIKE '+56 9 5%';
  DELETE FROM public.ot_real_costs WHERE operation_code LIKE 'WA-%' OR operation_code IN ('R00005','R00010');

  -- ── ACTIVE SESSIONS (start, no end) → "En producción" ───────────────────
  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, parsed_data, review_status, created_at)
  VALUES
    ('OT-40497', ot97, '+56 9 5111 0001', 'Carlos Muñoz', e_carlos, 'start',
     'inicio ot 40497 offset ryobi 2', now() - interval '2 hours',
     '{"confidence":0.96,"action":"start","machine":"Ryobi Offset 524GS #2"}'::jsonb, 'approved', now() - interval '2 hours'),
    ('OT-40498', ot98, '+56 9 5111 0002', 'Andrea Soto', e_andrea, 'start',
     'partiendo troquelado 40498', now() - interval '45 minutes',
     '{"confidence":0.91,"action":"start","machine":"Die Cutter #1"}'::jsonb, 'approved', now() - interval '45 minutes');

  -- ── LIVE REVIEW QUEUE (end, pending, with inferred costs) → "Pendientes" ──
  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, parsed_data, inferred_costs,
     elapsed_minutes, review_status, created_at)
  VALUES
    ('OT-40499', ot99, '+56 9 5111 0003', 'Jorge Herrera', e_jorge, 'end',
     'listo 40499, 3.5 horas offset, 12 planchas', now() - interval '18 minutes',
     '{"confidence":0.89,"action":"end"}'::jsonb,
     '{"cost_lines":[{"description":"Impresión Offset","category":"impresion","quantity":3.5,"unit":"hours","unit_cost":25000},{"description":"Planchas CTP","category":"materiales","quantity":12,"unit":"unit","unit_cost":8500}]}'::jsonb,
     210, 'pending', now() - interval '18 minutes'),
    ('OT-40500', ot00, '+56 9 5111 0004', 'Luis Vargas', e_luis, 'end',
     'termine pre prensa 40500, 2 horas', now() - interval '6 minutes',
     '{"confidence":0.84,"action":"end"}'::jsonb,
     '{"cost_lines":[{"description":"Pre-Prensa / CTP","category":"impresion","quantity":2,"unit":"hours","unit_cost":18000}]}'::jsonb,
     120, 'pending', now() - interval '6 minutes'),
    ('OT-40498', ot98, '+56 9 5111 0005', 'Miguel Fernández', e_miguel, 'end',
     'troquel 40498 terminado 4 hrs, 1 reventón ajustado', now() - interval '3 minutes',
     '{"confidence":0.78,"action":"end","flag":"low_confidence"}'::jsonb,
     '{"cost_lines":[{"description":"Troquelado","category":"terminaciones","quantity":4,"unit":"hours","unit_cost":30000}]}'::jsonb,
     240, 'pending', now() - interval '3 minutes');

  -- ── APPROVED + FED TO SYSTEM → cost reflected in ot_real_costs ───────────
  -- This is the demo climax: each approved message becomes a real cost line.
  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, parsed_data, inferred_costs,
     elapsed_minutes, review_status, reviewed_at, fed_to_system, created_at)
  VALUES ('OT-40494', ot94, '+56 9 5111 0006', 'Carlos Muñoz', e_carlos, 'end',
     'OT 40494 lista, 6 horas offset turno noche', now() - interval '4 hours',
     '{"confidence":0.94,"action":"end"}'::jsonb,
     '{"cost_lines":[{"description":"Impresión Offset","category":"impresion","quantity":6,"unit":"hours","unit_cost":25000}]}'::jsonb,
     360, 'approved', now() - interval '3 hours', true, now() - interval '4 hours')
  RETURNING id INTO l;
  INSERT INTO public.ot_real_costs (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, notes)
  VALUES (ot94, 'offset_printing', 'WA-' || left(l::text,8), 'Impresión Offset', 'impresion', 6, 'hours', 25000,
          'Registrado vía WhatsApp por Carlos Muñoz (turno noche)');

  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, parsed_data, inferred_costs,
     elapsed_minutes, review_status, reviewed_at, fed_to_system, created_at)
  VALUES ('OT-40492', ot92, '+56 9 5111 0007', 'Jorge Herrera', e_jorge, 'end',
     'cajas hogarmax 40492 terminadas, barniz uv 5 hrs', now() - interval '6 hours',
     '{"confidence":0.92,"action":"end"}'::jsonb,
     '{"cost_lines":[{"description":"Barniz UV + Terminación","category":"terminaciones","quantity":5,"unit":"hours","unit_cost":22000}]}'::jsonb,
     300, 'approved', now() - interval '5 hours', true, now() - interval '6 hours')
  RETURNING id INTO l;
  INSERT INTO public.ot_real_costs (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, notes)
  VALUES (ot92, 'workshop_revision', 'WA-' || left(l::text,8), 'Barniz UV + Terminación', 'terminaciones', 5, 'hours', 22000,
          'Registrado vía WhatsApp por Jorge Herrera');

  INSERT INTO public.whatsapp_production_logs
    (ot_number, ot_id, operator_phone, operator_name, operator_employee_id,
     message_type, raw_message, message_timestamp, parsed_data, inferred_costs,
     elapsed_minutes, review_status, reviewed_at, fed_to_system, created_at)
  VALUES ('OT-40488', ot88, '+56 9 5111 0008', 'Luis Vargas', e_luis, 'end',
     'promo distribuidora 40488 impresa, 8 hrs ryobi 2', now() - interval '26 hours',
     '{"confidence":0.90,"action":"end"}'::jsonb,
     '{"cost_lines":[{"description":"Impresión Offset","category":"impresion","quantity":8,"unit":"hours","unit_cost":25000}]}'::jsonb,
     480, 'auto_approved', now() - interval '26 hours', true, now() - interval '26 hours')
  RETURNING id INTO l;
  INSERT INTO public.ot_real_costs (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, notes)
  VALUES (ot88, 'offset_printing', 'WA-' || left(l::text,8), 'Impresión Offset', 'impresion', 8, 'hours', 25000,
          'Auto-aprobado (confianza alta) — vía WhatsApp por Luis Vargas');

  -- ── Consolidated REAL production costs for the month (materials + print) ──
  -- So "Costos Reales" and the monthly real-cost roll-up read substantial figures
  -- next to the budget (ot_operations) — the estimated-vs-real story.
  INSERT INTO public.ot_real_costs (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, notes)
  SELECT o.id, 'paper_purchase', 'R00010', 'Sustrato / Papel (real)', 'materiales',
         GREATEST(1, ROUND((o.total_price * 0.30 / 1800)::numeric, 2)), 'kg', 1800,
         'Costo real de materiales consolidado'
  FROM public.ots o
  WHERE o.ot_number BETWEEN 'OT-40481' AND 'OT-40496'
    AND NOT EXISTS (SELECT 1 FROM public.ot_real_costs rc WHERE rc.ot_id = o.id AND rc.operation_code = 'R00010');

  INSERT INTO public.ot_real_costs (ot_id, workflow_step, operation_code, description, category, quantity, unit, unit_cost, notes)
  SELECT o.id, 'offset_printing', 'R00005', 'Impresión Offset (real)', 'impresion',
         GREATEST(1, ROUND((o.total_price * 0.12 / 25000)::numeric, 2)), 'hours', 25000,
         'Horas de prensa consolidadas'
  FROM public.ots o
  WHERE o.ot_number BETWEEN 'OT-40481' AND 'OT-40496'
    AND NOT EXISTS (SELECT 1 FROM public.ot_real_costs rc WHERE rc.ot_id = o.id AND rc.operation_code = 'R00005');

  -- ── Budget operations (the ESTIMATE side) for the demo OTs ──────────────
  -- seed_09 set the price + financial roll-up but NOT the line-item budget that
  -- the cost breakdown and "Estimado vs Real" read. Add lines proportional to the
  -- OT total so estimate (ot_operations) sits next to real (ot_real_costs above).
  INSERT INTO public.ot_operations (ot_id, category, name, unit, quantity, unit_cost, sort_order)
  SELECT o.id, v.cat::public.ot_operation_category, v.name, v.unit,
         GREATEST(1, ROUND((o.total_price * v.share / v.uc)::numeric, 2)), v.uc, v.sort
  FROM public.ots o
  CROSS JOIN (VALUES
    ('materiales',    'Sustrato / Papel', 'kg',    0.30, 1800.0,  10),
    ('materiales',    'Tintas',           'kg',    0.06, 31915.0, 20),
    ('impresion',     'Impresión Offset', 'hours', 0.12, 25000.0, 30),
    ('terminaciones', 'Terminaciones',    'hours', 0.10, 22000.0, 40)
  ) AS v(cat, name, unit, share, uc, sort)
  WHERE o.ot_number BETWEEN 'OT-40481' AND 'OT-40500'
    AND NOT EXISTS (SELECT 1 FROM public.ot_operations op WHERE op.ot_id = o.id LIMIT 1);

  -- Note: ots has NO order_date column — the labor-margin tab derives the date
  -- from created_at. (That tab also needs worker_assignments, a legacy/new hybrid
  -- that is unsafe to seed blind — see the audit notes.)

  RAISE NOTICE 'seed_10 done: WhatsApp logs + real costs seeded.';
END $$;

-- ── Sync into the cost ledger (idempotent — mirrors the L1 backfill) ─────────
-- Lets ot_cost_summary pick up the operations/real-costs above even if the L1
-- migration ran before they existed. Requires 20260628130000_cost_ledger.sql.
INSERT INTO public.ot_cost_lines (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
SELECT op.ot_id, 'estimate',
  (CASE op.category::text WHEN 'materiales' THEN 'material' WHEN 'impresion' THEN 'machine'
     WHEN 'terminaciones' THEN 'finishing' WHEN 'tercerizado' THEN 'outsourced' ELSE 'other' END)::public.cost_line_category,
  'wizard', op.name, op.quantity, op.unit, op.unit_cost, 'operation', op.id, op.created_at
FROM public.ot_operations op
WHERE NOT EXISTS (SELECT 1 FROM public.ot_cost_lines cl WHERE cl.ref_type = 'operation' AND cl.ref_id = op.id);

INSERT INTO public.ot_cost_lines (ot_id, kind, category, source, description, quantity, unit, unit_cost, ref_type, ref_id, occurred_at)
SELECT rc.ot_id, 'actual',
  (CASE rc.category WHEN 'materiales' THEN 'material' WHEN 'impresion' THEN 'machine'
     WHEN 'terminaciones' THEN 'finishing' WHEN 'tercerizado' THEN 'outsourced' ELSE 'other' END)::public.cost_line_category,
  (CASE WHEN rc.operation_code LIKE 'WA-%' THEN 'whatsapp' ELSE 'manual' END),
  rc.description, rc.quantity, rc.unit, rc.unit_cost, 'real_cost', rc.id, rc.created_at
FROM public.ot_real_costs rc
WHERE NOT EXISTS (SELECT 1 FROM public.ot_cost_lines cl WHERE cl.ref_type = 'real_cost' AND cl.ref_id = rc.id);

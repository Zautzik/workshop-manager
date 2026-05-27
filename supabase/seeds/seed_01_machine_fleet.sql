-- ============================================================
-- SEED 01 — Machine Fleet
-- Imprenta Central  |  May 2025 → Apr 2026
-- 2× Ryobi 524GS | 1× Bobst Die Cutter | 3× Polar/Ideal Guillotines
-- 6× Manual Stations | 3× Delivery Vans
--
-- Run order: 01 of 07
-- Depends on: base migrations (machines, workstations, machine_costs tables)
-- Safe to re-run: YES (idempotent)
-- ============================================================

-- ── Defensive schema patches (may already exist) ────────────
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.worker_assignments
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(5,2) NOT NULL DEFAULT 8;

-- ── 1. Workstations (insert if not present) ─────────────────
INSERT INTO public.workstations (name, type, max_workers, status)
VALUES
  ('Puesto Offset A',    'offset_printer',  3, 'active'),
  ('Puesto Offset B',    'offset_printer',  3, 'active'),
  ('Puesto Troquelado',  'die_cutter',       2, 'active'),
  ('Puesto Corte',       'guillotine',       4, 'active'),
  ('Taller Manual',      'manual_workshop', 10, 'active'),
  ('Pre-Prensa',         'pre_press',        3, 'active'),
  ('Bodega y Despacho',  'other',            3, 'idle')
ON CONFLICT DO NOTHING;

-- ── 2. Rich profiles + workstation links on machines ────────
-- Machines were seeded by migration 20260426103000.
-- We enrich them here and link them to workstations.

DO $$
DECLARE
  v_r1   UUID;  v_r2   UUID;  v_dc  UUID;
  v_g1   UUID;  v_g2   UUID;  v_g3  UUID;
  v_mw1  UUID;  v_mw2  UUID;  v_mw3 UUID;
  v_mw4  UUID;  v_mw5  UUID;  v_mw6 UUID;
  v_dv1  UUID;  v_dv2  UUID;  v_dv3 UUID;
  v_ws_a UUID;  v_ws_b UUID;  v_ws_t UUID;
  v_ws_c UUID;  v_ws_m UUID;  v_ws_p UUID;  v_ws_d UUID;
BEGIN
  SELECT id INTO v_r1   FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #1'   LIMIT 1;
  SELECT id INTO v_r2   FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #2'   LIMIT 1;
  SELECT id INTO v_dc   FROM public.machines WHERE lower(name) = 'die cutter #1'            LIMIT 1;
  SELECT id INTO v_g1   FROM public.machines WHERE lower(name) = 'guillotine #1'            LIMIT 1;
  SELECT id INTO v_g2   FROM public.machines WHERE lower(name) = 'guillotine #2'            LIMIT 1;
  SELECT id INTO v_g3   FROM public.machines WHERE lower(name) = 'guillotine #3'            LIMIT 1;
  SELECT id INTO v_mw1  FROM public.machines WHERE lower(name) = 'manual workstation #1'   LIMIT 1;
  SELECT id INTO v_mw2  FROM public.machines WHERE lower(name) = 'manual workstation #2'   LIMIT 1;
  SELECT id INTO v_mw3  FROM public.machines WHERE lower(name) = 'manual workstation #3'   LIMIT 1;
  SELECT id INTO v_mw4  FROM public.machines WHERE lower(name) = 'manual workstation #4'   LIMIT 1;
  SELECT id INTO v_mw5  FROM public.machines WHERE lower(name) = 'manual workstation #5'   LIMIT 1;
  SELECT id INTO v_mw6  FROM public.machines WHERE lower(name) = 'manual workstation #6'   LIMIT 1;
  SELECT id INTO v_dv1  FROM public.machines WHERE lower(name) = 'dispatch vehicle #1'     LIMIT 1;
  SELECT id INTO v_dv2  FROM public.machines WHERE lower(name) = 'dispatch vehicle #2'     LIMIT 1;
  SELECT id INTO v_dv3  FROM public.machines WHERE lower(name) = 'dispatch vehicle #3'     LIMIT 1;

  SELECT id INTO v_ws_a FROM public.workstations WHERE name = 'Puesto Offset A'   LIMIT 1;
  SELECT id INTO v_ws_b FROM public.workstations WHERE name = 'Puesto Offset B'   LIMIT 1;
  SELECT id INTO v_ws_t FROM public.workstations WHERE name = 'Puesto Troquelado' LIMIT 1;
  SELECT id INTO v_ws_c FROM public.workstations WHERE name = 'Puesto Corte'      LIMIT 1;
  SELECT id INTO v_ws_m FROM public.workstations WHERE name = 'Taller Manual'     LIMIT 1;
  SELECT id INTO v_ws_p FROM public.workstations WHERE name = 'Pre-Prensa'        LIMIT 1;
  SELECT id INTO v_ws_d FROM public.workstations WHERE name = 'Bodega y Despacho' LIMIT 1;

  -- ── RYOBI 524GS #1 — Primary press ────────────────────────
  -- Educational note: nominal speed = max rated; optimal = real-world sustainable.
  -- Running above optimal causes blanket wear and colour register drift.
  IF v_r1 IS NOT NULL THEN
    UPDATE public.machines SET
      brand                    = 'Ryobi',
      model                    = '524GS',
      serial_number            = 'RY524-001-1994-0042',
      year_manufactured        = 1994,
      description              = 'Prensa offset de 4 colores Ryobi 524GS (1994). Motor principal 11 kW. '
                                 'Sistema de humectación convencional. 5 rodillos de entintado. '
                                 'Máquina principal: 45% del ingreso mensual del taller.',
      nominal_speed_sheets_hr  = 10000,
      optimal_speed_sheets_hr  = 7500,
      max_print_width_mm       = 370,
      max_print_height_mm      = 520,
      colors                   = 4,
      power_kw                 = 14.0,
      energy_cost_per_hr       = 1.68,
      maintenance_cost_monthly = 1200.00,
      depreciation_monthly     = 1500.00,
      status                   = 'running',
      is_active                = true,
      workstation_id           = v_ws_a
    WHERE id = v_r1;
  END IF;

  -- ── RYOBI 524GS #2 — Secondary press ──────────────────────
  IF v_r2 IS NOT NULL THEN
    UPDATE public.machines SET
      brand                    = 'Ryobi',
      model                    = '524GS',
      serial_number            = 'RY524-002-1996-0087',
      year_manufactured        = 1996,
      description              = 'Prensa offset 4 colores Ryobi 524GS (1996). Segunda prensa. '
                                 'Usada para tirajes medianos y trabajos de 1-2 colores de alta velocidad. '
                                 'Absorbe carga extra durante crunches y averías de prensa #1.',
      nominal_speed_sheets_hr  = 10000,
      optimal_speed_sheets_hr  = 7000,
      max_print_width_mm       = 370,
      max_print_height_mm      = 520,
      colors                   = 4,
      power_kw                 = 14.0,
      energy_cost_per_hr       = 1.68,
      maintenance_cost_monthly = 1100.00,
      depreciation_monthly     = 1200.00,
      status                   = 'running',
      is_active                = true,
      workstation_id           = v_ws_b
    WHERE id = v_r2;
  END IF;

  -- ── BOBST SP 102-E Die Cutter ──────────────────────────────
  -- Educational note: Bobst is the industry standard for automated die-cutting.
  -- SP 102-E handles sheets up to 720×1020mm. Used for LabelCorp + PackBrands boxes.
  IF v_dc IS NOT NULL THEN
    UPDATE public.machines SET
      brand                    = 'Bobst',
      model                    = 'SP 102-E',
      serial_number            = 'BST-102E-2003-4412',
      year_manufactured        = 2003,
      description              = 'Troqueladora plana automática Bobst SP 102-E (2003). '
                                 'Velocidad hasta 6.000 pliegos/hora. '
                                 'Troquelado, hendido y perforado simultáneo. '
                                 'Clave para cajas PackBrands y etiquetas troqueladas LabelCorp.',
      nominal_speed_sheets_hr  = 6000,
      optimal_speed_sheets_hr  = 4500,
      max_print_width_mm       = 720,
      max_print_height_mm      = 1020,
      colors                   = 1,
      power_kw                 = 7.5,
      energy_cost_per_hr       = 0.90,
      maintenance_cost_monthly = 600.00,
      depreciation_monthly     = 800.00,
      status                   = 'running',
      is_active                = true,
      workstation_id           = v_ws_t
    WHERE id = v_dc;
  END IF;

  -- ── POLAR 115 EMC — Guillotine #1 (main cutter) ───────────
  IF v_g1 IS NOT NULL THEN
    UPDATE public.machines SET
      brand = 'Polar', model = '115 EMC-MONITOR',
      serial_number = 'POL-115-2001-0341', year_manufactured = 2001,
      description = 'Guillotina Polar 115 programable. Mesa de aire integrada. '
                    'Corte máximo 115 cm. Pantalla táctil. Máquina principal de corte. '
                    'Usada en primer y último corte de todos los trabajos.',
      power_kw = 2.2, energy_cost_per_hr = 0.26,
      maintenance_cost_monthly = 250.00, depreciation_monthly = 300.00,
      status = 'running', is_active = true, workstation_id = v_ws_c
    WHERE id = v_g1;
  END IF;

  -- ── POLAR 92 ED — Guillotine #2 ───────────────────────────
  IF v_g2 IS NOT NULL THEN
    UPDATE public.machines SET
      brand = 'Polar', model = '92 ED',
      serial_number = 'POL-92-1998-0219', year_manufactured = 1998,
      description = 'Guillotina Polar 92. Corte máximo 92 cm. '
                    'Prelotes y cortes secundarios. Backup de guillotina #1.',
      power_kw = 1.8, energy_cost_per_hr = 0.22,
      maintenance_cost_monthly = 200.00, depreciation_monthly = 200.00,
      status = 'running', is_active = true, workstation_id = v_ws_c
    WHERE id = v_g2;
  END IF;

  -- ── IDEAL 7228 — Guillotine #3 ────────────────────────────
  IF v_g3 IS NOT NULL THEN
    UPDATE public.machines SET
      brand = 'Ideal', model = '7228-95',
      serial_number = 'IDL-7228-2005-0087', year_manufactured = 2005,
      description = 'Guillotina Ideal 7228-95. Cortes de acabado y trabajos menores. '
                    'Operada durante crunches cuando las otras dos están saturadas.',
      power_kw = 1.5, energy_cost_per_hr = 0.18,
      maintenance_cost_monthly = 150.00, depreciation_monthly = 180.00,
      status = 'idle', is_active = true, workstation_id = v_ws_c
    WHERE id = v_g3;
  END IF;

  -- ── Manual Workstations ───────────────────────────────────
  IF v_mw1 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — pegado y empaque. Sector A. Operadoras: María G., Ana M.', power_kw = 0.1, energy_cost_per_hr = 0.01, status = 'running', is_active = true, workstation_id = v_ws_m WHERE id = v_mw1; END IF;
  IF v_mw2 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — doblado y revisión de etiquetas. Sector A. Operadoras: Carmen L., Isabel R.', power_kw = 0.1, energy_cost_per_hr = 0.01, status = 'running', is_active = true, workstation_id = v_ws_m WHERE id = v_mw2; END IF;
  IF v_mw3 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — numeración y embalaje. Sector B. Operadores: José S., Daniel P.', power_kw = 0.1, energy_cost_per_hr = 0.01, status = 'running', is_active = true, workstation_id = v_ws_m WHERE id = v_mw3; END IF;
  IF v_mw4 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — control de calidad final. Sector B. Activada en crunches.', power_kw = 0.1, energy_cost_per_hr = 0.01, status = 'idle', is_active = true, workstation_id = v_ws_m WHERE id = v_mw4; END IF;
  IF v_mw5 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — rebobinado y rollos de etiquetas autoadhesivas. Sector B.', power_kw = 0.2, energy_cost_per_hr = 0.02, status = 'running', is_active = true, workstation_id = v_ws_m WHERE id = v_mw5; END IF;
  IF v_mw6 IS NOT NULL THEN UPDATE public.machines SET description = 'Mesa manual — laminado manual y reprocesos. Activada en crunches.', power_kw = 0.1, energy_cost_per_hr = 0.01, status = 'idle', is_active = true, workstation_id = v_ws_m WHERE id = v_mw6; END IF;

  -- ── Delivery Vehicles ─────────────────────────────────────
  IF v_dv1 IS NOT NULL THEN UPDATE public.machines SET brand = 'Volkswagen', model = 'Crafter 50 TDI', serial_number = 'WVZZZ2ZZ6GH123456', year_manufactured = 2016, description = 'Furgón despacho principal. 1.000 kg. Zona Metropolitana y urgentes. Conductor: Pablo D.', power_kw = 85.0, maintenance_cost_monthly = 350.00, status = 'idle', is_active = true, workstation_id = v_ws_d WHERE id = v_dv1; END IF;
  IF v_dv2 IS NOT NULL THEN UPDATE public.machines SET brand = 'Ford', model = 'Transit 350 L3H2', serial_number = 'WF0FXXTTGFDF78901', year_manufactured = 2018, description = 'Furgón despacho grande. 1.200 kg. Regiones y clientes volumen.', power_kw = 100.0, maintenance_cost_monthly = 300.00, status = 'idle', is_active = true, workstation_id = v_ws_d WHERE id = v_dv2; END IF;
  IF v_dv3 IS NOT NULL THEN UPDATE public.machines SET brand = 'Renault', model = 'Master L3H2', serial_number = 'VF1MAFB4H54321098', year_manufactured = 2019, description = 'Furgón reparto express y nocturno para entregas urgentes en crunches.', power_kw = 90.0, maintenance_cost_monthly = 320.00, status = 'idle', is_active = true, workstation_id = v_ws_d WHERE id = v_dv3; END IF;

  -- ── Reverse-link: set workstations.machine_id ───────────────────────────
  -- Each workstation gets a primary machine so the planta_live view works
  -- correctly. Multi-machine workstations (Puesto Corte, Taller Manual,
  -- Bodega y Despacho) use the first machine as primary.
  IF v_ws_a IS NOT NULL AND v_r1 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_r1 WHERE id = v_ws_a;
  END IF;
  IF v_ws_b IS NOT NULL AND v_r2 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_r2 WHERE id = v_ws_b;
  END IF;
  IF v_ws_t IS NOT NULL AND v_dc IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_dc WHERE id = v_ws_t;
  END IF;
  -- Puesto Corte: 3 guillotines share this workstation → assign g1 as primary
  IF v_ws_c IS NOT NULL AND v_g1 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_g1 WHERE id = v_ws_c;
  END IF;
  -- Taller Manual: 6 manual stations share this workstation → assign mw1 as primary
  IF v_ws_m IS NOT NULL AND v_mw1 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_mw1 WHERE id = v_ws_m;
  END IF;
  -- Pre-Prensa: no dedicated machine in this seed — leave machine_id NULL
  -- Bodega y Despacho: 3 vans share this workstation → assign dv1 as primary
  IF v_ws_d IS NOT NULL AND v_dv1 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = v_dv1 WHERE id = v_ws_d;
  END IF;

END $$;

-- ── 3. Machine Costs — 12 months ────────────────────────────
-- Revenue attribution: Ryobi #1 ~44%, Ryobi #2 ~38%, Die Cutter ~12%, Guillotine #1 ~6%
-- CRUNCH months: Aug-25, Nov-25, Mar-26 (all 3 big clients deadline simultaneously)
-- BREAKDOWN: Mar-26 Ryobi #1 down 3 days → revenue drop + outsourcing spike
-- TINKER TIP: Adjust energy_cost to simulate energy price fluctuation scenarios.
INSERT INTO public.machine_costs
  (machine_id, month, energy_cost, labor_cost, maintenance_cost, spare_parts_cost,
   outsourcing_cost, revenue_generated, notes)
SELECT m.id,
       d.month::DATE,
       d.ec, d.lc, d.mc, d.sc, d.oc, d.rev, d.notes
FROM (VALUES
  -- Ryobi 524GS #1 ─────────────────────────────────────────
  ('Ryobi Offset 524GS #1','2025-05-01', 580,4400,1200, 220,   0, 133000,'Mayo 2025 — operación estable, tiraje normal'),
  ('Ryobi Offset 524GS #1','2025-06-01', 555,4400,1100, 185,   0, 126000,'Junio 2025 — tirajes medianos, ritmo normal'),
  ('Ryobi Offset 524GS #1','2025-07-01', 570,4400,1200, 200,   0, 131000,'Julio 2025 — incremento leve demanda'),
  ('Ryobi Offset 524GS #1','2025-08-01', 940,5280,1400, 390,   0, 192000,'CRUNCH Q1: doble turno; 3 clientes con deadline simultáneo'),
  ('Ryobi Offset 524GS #1','2025-09-01', 615,4400,1200, 215,   0, 140000,'Sep-25 recuperación post-crunch'),
  ('Ryobi Offset 524GS #1','2025-10-01', 540,4400,1100, 190,   0, 123000,'Oct-25 carga normal'),
  ('Ryobi Offset 524GS #1','2025-11-01', 895,5280,1350, 360,   0, 181000,'CRUNCH Q2: pico anticipado fin de año'),
  ('Ryobi Offset 524GS #1','2025-12-01', 450,4400,1200, 150,   0,  98000,'Dic-25 producción reducida por feriados'),
  ('Ryobi Offset 524GS #1','2026-01-01', 520,4400,1100, 180,   0, 116000,'Ene-26 reinicio año, ramp-up lento'),
  ('Ryobi Offset 524GS #1','2026-02-01', 565,4400,1200, 205,   0, 128000,'Feb-26 demanda creciente'),
  ('Ryobi Offset 524GS #1','2026-03-01', 780,5280,3800,4500,   0, 145000,'CRUNCH Q3 + AVERÍA: cojinete cilindro blanqueta; 3 días fuera'),
  ('Ryobi Offset 524GS #1','2026-04-01', 605,4400,1400, 325,   0, 136000,'Abr-26 recuperación completa post-avería'),
  -- Ryobi 524GS #2 ─────────────────────────────────────────
  ('Ryobi Offset 524GS #2','2025-05-01', 540,4400,1100, 200,   0, 116000,'Mayo 2025'),
  ('Ryobi Offset 524GS #2','2025-06-01', 525,4400,1050, 175,   0, 112000,'Junio 2025'),
  ('Ryobi Offset 524GS #2','2025-07-01', 545,4400,1100, 190,   0, 118000,'Julio 2025'),
  ('Ryobi Offset 524GS #2','2025-08-01', 850,5280,1300, 360,   0, 174000,'CRUNCH Q1 — turno doble completo'),
  ('Ryobi Offset 524GS #2','2025-09-01', 572,4400,1100, 205,   0, 128000,'Sep-25'),
  ('Ryobi Offset 524GS #2','2025-10-01', 510,4400,1000, 170,   0, 109000,'Oct-25'),
  ('Ryobi Offset 524GS #2','2025-11-01', 840,5280,1250, 335,   0, 168000,'CRUNCH Q2'),
  ('Ryobi Offset 524GS #2','2025-12-01', 420,4400,1100, 140,   0,  90000,'Dic-25'),
  ('Ryobi Offset 524GS #2','2026-01-01', 490,4400,1000, 160,   0, 105000,'Ene-26'),
  ('Ryobi Offset 524GS #2','2026-02-01', 535,4400,1100, 188,   0, 118000,'Feb-26'),
  ('Ryobi Offset 524GS #2','2026-03-01', 920,5720,1350, 405,2800, 188000,'CRUNCH Q3 + absorbe carga avería Ryobi #1; subcontrata 2 jobs'),
  ('Ryobi Offset 524GS #2','2026-04-01', 585,4400,1100, 215,   0, 125000,'Abr-26'),
  -- Die Cutter #1 ──────────────────────────────────────────
  ('Die Cutter #1','2025-05-01', 280,2400, 600, 120,   0, 27000,'Mayo 2025'),
  ('Die Cutter #1','2025-06-01', 265,2400, 580, 100,   0, 25000,'Junio 2025'),
  ('Die Cutter #1','2025-07-01', 270,2400, 600, 110,   0, 27000,'Julio 2025'),
  ('Die Cutter #1','2025-08-01', 455,2880, 700, 200,   0, 53000,'CRUNCH Q1 — troquelado masivo LabelCorp + PackBrands'),
  ('Die Cutter #1','2025-09-01', 295,2400, 600, 125,   0, 29000,'Sep-25'),
  ('Die Cutter #1','2025-10-01', 260,2400, 580, 100,   0, 24000,'Oct-25'),
  ('Die Cutter #1','2025-11-01', 435,2880, 680, 190,   0, 51000,'CRUNCH Q2'),
  ('Die Cutter #1','2025-12-01', 200,2400, 580,  90,   0, 17000,'Dic-25'),
  ('Die Cutter #1','2026-01-01', 240,2400, 570,  95,   0, 21000,'Ene-26'),
  ('Die Cutter #1','2026-02-01', 270,2400, 600, 110,   0, 25000,'Feb-26'),
  ('Die Cutter #1','2026-03-01', 485,2880, 720, 215,   0, 57000,'CRUNCH Q3 — mayor vol. por 3 clientes simultáneos'),
  ('Die Cutter #1','2026-04-01', 290,2400, 600, 120,   0, 27000,'Abr-26'),
  -- Guillotine #1 ──────────────────────────────────────────
  ('Guillotine #1','2025-05-01',  80,1980, 250,  50,   0, 13500,'Mayo 2025'),
  ('Guillotine #1','2025-06-01',  75,1980, 230,  40,   0, 12500,'Junio 2025'),
  ('Guillotine #1','2025-07-01',  78,1980, 240,  45,   0, 13000,'Julio 2025'),
  ('Guillotine #1','2025-08-01', 130,2376, 280,  80,   0, 23000,'CRUNCH Q1'),
  ('Guillotine #1','2025-09-01',  85,1980, 250,  52,   0, 14500,'Sep-25'),
  ('Guillotine #1','2025-10-01',  72,1980, 230,  40,   0, 11500,'Oct-25'),
  ('Guillotine #1','2025-11-01', 125,2376, 270,  75,   0, 21500,'CRUNCH Q2'),
  ('Guillotine #1','2025-12-01',  60,1980, 230,  35,   0,  8500,'Dic-25'),
  ('Guillotine #1','2026-01-01',  70,1980, 230,  40,   0, 10500,'Ene-26'),
  ('Guillotine #1','2026-02-01',  78,1980, 240,  45,   0, 12500,'Feb-26'),
  ('Guillotine #1','2026-03-01', 142,2376, 290,  88,   0, 25500,'CRUNCH Q3'),
  ('Guillotine #1','2026-04-01',  83,1980, 250,  52,   0, 13500,'Abr-26')
) AS d(machine_name, month, ec, lc, mc, sc, oc, rev, notes)
JOIN public.machines m ON lower(m.name) = lower(d.machine_name)
ON CONFLICT (machine_id, month) DO UPDATE SET
  energy_cost       = EXCLUDED.energy_cost,
  labor_cost        = EXCLUDED.labor_cost,
  maintenance_cost  = EXCLUDED.maintenance_cost,
  spare_parts_cost  = EXCLUDED.spare_parts_cost,
  outsourcing_cost  = EXCLUDED.outsourcing_cost,
  revenue_generated = EXCLUDED.revenue_generated,
  notes             = EXCLUDED.notes;

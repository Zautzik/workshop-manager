-- ============================================================
-- SEED 05 — Production Floor
-- Shifts · Worker Assignments · Machine Schedules · WhatsApp Logs
--
-- Run order: 05 of 07
-- Depends on: 01 (machines), 02 (employees), 03 (clients), 04 (ots)
-- Safe to re-run: YES (ON CONFLICT DO NOTHING on all inserts)
--
-- TINKER TIPS:
--   • Comment out an entire crunch-week block in worker_assignments
--     → see which OTs show no assigned operators on the floor view.
--   • Add a duplicate shift_id to worker_assignments for an employee
--     → triggers the double-booking constraint error to verify it.
--   • Delete a WhatsApp log entry and watch the realtime feed update.
-- ============================================================

DO $$
DECLARE
  -- Employee IDs (resolved by rut)
  e_carlos   UUID;  -- Carlos Mendoza — press op #1 (senior)
  e_jorge    UUID;  -- Jorge Ríos — press op #2
  e_miguel   UUID;  -- Miguel Torres — die cut #1
  e_ana      UUID;  -- Ana González — guillotine #1
  e_roberto  UUID;  -- Roberto Saavedra — manual finisher #1
  e_carmen   UUID;  -- Carmen López — manual finisher #2
  e_patricia UUID;  -- Patricia Vidal — pre-press #1
  e_andrea   UUID;  -- Andrea Herrera — pre-press #2
  e_luis     UUID;  -- Luis Fernández — press op #3 (backup)
  e_mario    UUID;  -- Mario Ríos — die cut #2
  e_supervisor UUID; -- Eduardo Castro — supervisor
  -- Machine IDs
  m_r1 UUID; m_r2 UUID; m_dc UUID; m_g1 UUID; m_g2 UUID;
  -- Workstation IDs
  ws_r1 UUID; ws_r2 UUID; ws_dc UUID;
  ws_g1 UUID; ws_manual UUID; ws_manual_2 UUID; ws_dispatch UUID;
  -- Shift IDs (will be created then resolved)
  s_may_d UUID; s_aug_crunch_d UUID; s_aug_crunch_n UUID;
  s_nov_crunch_d UUID; s_nov_crunch_n UUID;
  s_mar_crunch_d UUID; s_mar_crunch_n UUID;
  -- OT IDs for scheduling
  ot_018 UUID; ot_019 UUID; ot_020 UUID; ot_021 UUID;
  ot_034 UUID; ot_035 UUID; ot_036 UUID; ot_037 UUID;
  ot_011 UUID; ot_012 UUID; ot_013 UUID; ot_014 UUID;
BEGIN
  -- ── Resolve Employees (by employee_code — no rut column on employees) ──
  SELECT id INTO e_carlos     FROM public.employees WHERE employee_code = 'EMP-003' LIMIT 1;
  SELECT id INTO e_jorge      FROM public.employees WHERE employee_code = 'EMP-004' LIMIT 1;
  SELECT id INTO e_miguel     FROM public.employees WHERE employee_code = 'EMP-008' LIMIT 1;
  SELECT id INTO e_ana        FROM public.employees WHERE employee_code = 'EMP-013' LIMIT 1;
  SELECT id INTO e_roberto    FROM public.employees WHERE employee_code = 'EMP-009' LIMIT 1;
  SELECT id INTO e_carmen     FROM public.employees WHERE employee_code = 'EMP-014' LIMIT 1;
  SELECT id INTO e_patricia   FROM public.employees WHERE employee_code = 'EMP-006' LIMIT 1;
  SELECT id INTO e_andrea     FROM public.employees WHERE employee_code = 'EMP-007' LIMIT 1;
  SELECT id INTO e_luis       FROM public.employees WHERE employee_code = 'EMP-005' LIMIT 1;
  -- e_mario: no dedicated die-cut #2 employee in seed_02; variable stays NULL (unused)
  SELECT id INTO e_supervisor FROM public.employees WHERE employee_code = 'EMP-001' LIMIT 1;

  -- ── Resolve Machines ──────────────────────────────────────
  SELECT id INTO m_r1 FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #1' LIMIT 1;
  SELECT id INTO m_r2 FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #2' LIMIT 1;
  SELECT id INTO m_dc FROM public.machines WHERE lower(name) = 'die cutter #1'          LIMIT 1;
  SELECT id INTO m_g1 FROM public.machines WHERE lower(name) = 'guillotine #1'          LIMIT 1;
  SELECT id INTO m_g2 FROM public.machines WHERE lower(name) = 'guillotine #2'          LIMIT 1;

  -- ── Resolve Workstations ──────────────────────────────────
    SELECT id INTO ws_r1
    FROM public.workstations
    WHERE lower(name) LIKE '%puesto offset a%'
      OR lower(name) LIKE '%offset printer 1%'
      OR lower(name) LIKE '%ryobi%#1%'
    LIMIT 1;

    SELECT id INTO ws_r2
    FROM public.workstations
    WHERE lower(name) LIKE '%puesto offset b%'
      OR lower(name) LIKE '%offset printer 2%'
      OR lower(name) LIKE '%ryobi%#2%'
    LIMIT 1;

    SELECT id INTO ws_dc
    FROM public.workstations
    WHERE lower(name) LIKE '%puesto troquelado%'
      OR lower(name) LIKE '%die cutter%'
    LIMIT 1;

    SELECT id INTO ws_g1
    FROM public.workstations
    WHERE lower(name) LIKE '%guillotine 1%'
      OR lower(name) LIKE '%puesto corte%'
    LIMIT 1;

    SELECT id INTO ws_manual
    FROM public.workstations
    WHERE lower(name) LIKE '%taller manual%'
    LIMIT 1;

    SELECT id INTO ws_manual_2
    FROM public.workstations
    WHERE (
      lower(name) LIKE '%workshop station 1%'
      OR lower(name) LIKE '%workshop station 2%'
      OR lower(name) LIKE '%taller manual%'
    )
      AND (ws_manual IS NULL OR id <> ws_manual)
    LIMIT 1;

    SELECT id INTO ws_dispatch
    FROM public.workstations
    WHERE lower(name) LIKE '%bodega y despacho%'
    LIMIT 1;

  -- ── Resolve OTs ───────────────────────────────────────────
  SELECT id INTO ot_018 FROM public.ots WHERE ot_number = 'OT-2025-018';
  SELECT id INTO ot_019 FROM public.ots WHERE ot_number = 'OT-2025-019';
  SELECT id INTO ot_020 FROM public.ots WHERE ot_number = 'OT-2025-020';
  SELECT id INTO ot_021 FROM public.ots WHERE ot_number = 'OT-2025-021';
  SELECT id INTO ot_034 FROM public.ots WHERE ot_number = 'OT-2025-034';
  SELECT id INTO ot_035 FROM public.ots WHERE ot_number = 'OT-2025-035';
  SELECT id INTO ot_036 FROM public.ots WHERE ot_number = 'OT-2025-036';
  SELECT id INTO ot_037 FROM public.ots WHERE ot_number = 'OT-2025-037';
  SELECT id INTO ot_011 FROM public.ots WHERE ot_number = 'OT-2026-011';
  SELECT id INTO ot_012 FROM public.ots WHERE ot_number = 'OT-2026-012';
  SELECT id INTO ot_013 FROM public.ots WHERE ot_number = 'OT-2026-013';
  SELECT id INTO ot_014 FROM public.ots WHERE ot_number = 'OT-2026-014';

  -- ══════════════════════════════════════════════════════════
  -- SHIFTS
  -- Regular days + crunch periods (Aug, Nov, Mar)
  -- shifts table: (id, name, start_time, end_time) only
  -- ══════════════════════════════════════════════════════════

  -- May 2025 sample (normal day shift)
  INSERT INTO public.shifts (id, name, start_time, end_time)
  VALUES
    (gen_random_uuid(), 'Turno Día — 12 May 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 19 May 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 26 May 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 09 Jun 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 16 Jun 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 14 Jul 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día — 21 Jul 2025',  '07:00', '15:00')
  ON CONFLICT DO NOTHING;

  -- August 2025 CRUNCH — day shifts
  INSERT INTO public.shifts (id, name, start_time, end_time)
  VALUES
    (gen_random_uuid(), 'Turno Día CRUNCH — 11 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 12 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 13 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 14 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 15 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 18 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 19 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 20 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 21 Ago 2025',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 22 Ago 2025',  '07:00', '15:00')
  ON CONFLICT DO NOTHING;

  -- August 2025 CRUNCH — NIGHT shifts (15:00–23:00)
  INSERT INTO public.shifts (id, name, start_time, end_time)
  VALUES
    (gen_random_uuid(), 'Turno Noche CRUNCH — 11 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 12 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 13 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 14 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 18 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 19 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 20 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 21 Ago 2025', '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 22 Ago 2025', '15:00', '23:00')
  ON CONFLICT DO NOTHING;

  -- November 2025 CRUNCH — day + night shifts
  INSERT INTO public.shifts (id, name, start_time, end_time)
  VALUES
    (gen_random_uuid(), 'Turno Día CRUNCH — 10 Nov 2025 (Carlos licencia)',   '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 11 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 12 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 13 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 14 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 17 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 18 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 19 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 20 Nov 2025',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 21 Nov 2025 (Carlos reintegra)',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 17 Nov 2025',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 18 Nov 2025',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 19 Nov 2025',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 20 Nov 2025',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 21 Nov 2025',                   '15:00', '23:00')
  ON CONFLICT DO NOTHING;

  -- March 2026 CRUNCH + RYOBI #1 BREAKDOWN
  INSERT INTO public.shifts (id, name, start_time, end_time)
  VALUES
    (gen_random_uuid(), 'Turno Día CRUNCH — 09 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 10 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 11 Mar 2026 (⚠ Avería Ryobi #1)', '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 12 Mar 2026 (Ryobi #1 fuera)',    '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 13 Mar 2026 (Ryobi #1 regresa)',  '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 14 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 17 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 18 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 19 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Día CRUNCH — 20 Mar 2026',                     '07:00', '15:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 17 Mar 2026',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 18 Mar 2026',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 19 Mar 2026',                   '15:00', '23:00'),
    (gen_random_uuid(), 'Turno Noche CRUNCH — 20 Mar 2026',                   '15:00', '23:00')
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════
  -- MACHINE SCHEDULES (ot_machine_schedule)
  -- Gantt slots for crunch OTs + representative normal OTs
  -- ══════════════════════════════════════════════════════════

  -- Aug 2025 Crunch — Ryobi #1 (LabelCorp OT-018, OT-019)
  INSERT INTO public.ot_machine_schedule
    (ot_id, machine_id, scheduled_start, scheduled_end,
     actual_start, actual_end, estimated_hours, actual_hours,
     calc_sheets, paper_type_label)
  VALUES
    (ot_018, m_r1,
     '2025-08-11 07:00', '2025-08-15 15:00',
     '2025-08-11 07:15', '2025-08-15 14:45',
     32.0, 31.5, 46667, 'Adhesivo 80gsm — Couche self-adhesive roll'),
    (ot_019, m_r1,
     '2025-08-18 07:00', '2025-08-22 12:00',
     '2025-08-18 07:10', '2025-08-22 11:50',
     29.0, 28.7, 18667, 'Adhesivo 80gsm — Couche self-adhesive roll')
  ON CONFLICT DO NOTHING;

  -- Aug 2025 Crunch — Ryobi #2 (PackBrands OT-020, Distribuidora OT-021)
  INSERT INTO public.ot_machine_schedule
    (ot_id, machine_id, scheduled_start, scheduled_end,
     actual_start, actual_end, estimated_hours, actual_hours,
     calc_sheets, paper_type_label)
  VALUES
    (ot_020, m_r2,
     '2025-08-11 07:00', '2025-08-18 15:00',
     '2025-08-11 07:05', '2025-08-18 14:55',
     48.0, 47.8, 18333, 'Cartulina 350gsm C1S'),
    (ot_021, m_r2,
     '2025-08-18 15:00', '2025-08-22 23:00',  -- NIGHT SHIFT
     '2025-08-18 15:00', '2025-08-22 22:30',
     32.0, 31.5, 36667, 'Adhesivo 60gsm — economia roll')
  ON CONFLICT DO NOTHING;

  -- Nov 2025 Crunch — LabelCorp OT-034, OT-035 on Ryobi #1 (Jorge)
  INSERT INTO public.ot_machine_schedule
    (ot_id, machine_id, scheduled_start, scheduled_end,
     actual_start, actual_end, estimated_hours, actual_hours,
     calc_sheets, paper_type_label)
  VALUES
    (ot_034, m_r1,
     '2025-11-10 07:00', '2025-11-14 15:00',
     '2025-11-10 07:20', '2025-11-14 15:10',
     32.0, 32.2, 53333, 'Adhesivo 80gsm farmacéutico'),
    (ot_035, m_r1,
     '2025-11-17 07:00', '2025-11-21 15:00',
     '2025-11-17 07:15', '2025-11-21 14:40',
     32.0, 31.4, 16667, 'Adhesivo 80gsm farmacéutico')
  ON CONFLICT DO NOTHING;

  -- Nov 2025 Crunch — PackBrands OT-036 + Distrib OT-037 on Ryobi #2 (Luis)
  INSERT INTO public.ot_machine_schedule
    (ot_id, machine_id, scheduled_start, scheduled_end,
     actual_start, actual_end, estimated_hours, actual_hours,
     calc_sheets, paper_type_label)
  VALUES
    (ot_036, m_r2,
     '2025-11-10 07:00', '2025-11-19 15:00',
     '2025-11-10 07:05', '2025-11-19 14:50',
     64.0, 63.7, 57143, 'Adhesivo 80gsm / Cartulina 350gsm'),
    (ot_037, m_r2,
     '2025-11-17 15:00', '2025-11-21 23:00',  -- NIGHT SHIFT overlap
     '2025-11-17 15:00', '2025-11-21 22:45',
     32.0, 31.7, 40000, 'Adhesivo 60gsm economia')
  ON CONFLICT DO NOTHING;

  -- Mar 2026 Crunch — NeuroCalm OT-011 on Ryobi #1 (Carlos, with breakdown)
  INSERT INTO public.ot_machine_schedule
    (ot_id, machine_id, scheduled_start, scheduled_end,
     actual_start, actual_end, estimated_hours, actual_hours,
     calc_sheets, paper_type_label)
  VALUES
    (ot_011, m_r1,
     '2026-03-09 07:00', '2026-03-13 15:00',
     '2026-03-09 07:10', '2026-03-13 14:00',   -- stopped at 09:30 day 3, resumed day 5
     32.0, 29.3, 50667,  -- 29.3 actual due to downtime
     'Adhesivo 80gsm farmacéutico — INTERRUPCIÓN 11/03 09:30–13/03 14:00'),

    -- AllerFree OT-012 on Ryobi #2 (Jorge while Carlos's machine is down)
    (ot_012, m_r2,
     '2026-03-11 07:00', '2026-03-20 15:00',
     '2026-03-11 07:05', '2026-03-20 14:55',
     64.0, 63.8, 20000, 'Adhesivo 80gsm farmacéutico'),

    -- HogarMax OT-013 also Ryobi #2 (stacked, night shift week of 17 Mar)
    (ot_013, m_r2,
     '2026-03-14 15:00', '2026-03-19 23:00',
     '2026-03-14 15:05', '2026-03-19 22:30',
     40.0, 39.4, 20000, 'Cartulina 350gsm C1S'),

    -- Distribuidora OT-014 — Ryobi #2 nights 17–20 Mar
    (ot_014, m_r2,
     '2026-03-17 15:00', '2026-03-20 23:00',
     '2026-03-17 15:00', '2026-03-20 22:45',
     32.0, 31.7, 38667, 'Adhesivo 60gsm economia')
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════

  -- ══════════════════════════════════════════════════════════
  -- WORKER ASSIGNMENTS (simulate a functioning press floor)
  -- ══════════════════════════════════════════════════════════

  -- Resolve representative shift IDs used by planner defaults
  SELECT id INTO s_may_d
  FROM public.shifts
  WHERE name = 'Turno Día — 12 May 2025'
  ORDER BY id DESC
  LIMIT 1;

  SELECT id INTO s_aug_crunch_n
  FROM public.shifts
  WHERE name = 'Turno Noche CRUNCH — 20 Ago 2025'
  ORDER BY id DESC
  LIMIT 1;

  -- Seed a full-floor roster for today's selected day shift.
  -- Clear today's assignments for these demo employees so reruns remain deterministic.
  DELETE FROM public.worker_assignments
  WHERE date = CURRENT_DATE
    AND employee_id IN (
      e_carlos, e_jorge, e_miguel, e_ana, e_roberto,
      e_carmen, e_patricia, e_andrea, e_luis, e_supervisor
    );

  WITH base_roster AS (
    SELECT *
    FROM (VALUES
      (e_carlos, ws_r1, s_may_d, 'operator'),
      (e_jorge,  ws_r2, s_may_d, 'operator'),
      (e_miguel, ws_dc, s_may_d, 'operator'),
      (e_ana,    ws_g1, s_may_d, 'guillotine'),
      (e_roberto, COALESCE(ws_manual, ws_manual_2), s_may_d, 'finisher'),
      (e_carmen,  COALESCE(ws_manual_2, ws_manual), s_may_d, 'finisher'),
      (e_luis,   ws_r2, s_may_d, 'backup'),
      (e_supervisor, ws_dispatch, s_may_d, 'supervisor')
    ) AS r(employee_id, workstation_id, shift_id, role)
    WHERE employee_id IS NOT NULL
      AND workstation_id IS NOT NULL
      AND shift_id IS NOT NULL
  )
  INSERT INTO public.worker_assignments (employee_id, workstation_id, shift_id, date, role)
  SELECT r.employee_id, r.workstation_id, r.shift_id, CURRENT_DATE, r.role
  FROM base_roster r;

  -- WHATSAPP PRODUCTION LOGS
  -- Sample messages from operators during crunch periods.
  -- Mix of: shift start, progress updates, problem reports,
  --         end of shift summaries, quality stops.
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.whatsapp_production_logs
    (ot_id, ot_number, operator_employee_id, operator_name, operator_phone,
     message_type, raw_message, parsed_data, review_status, message_timestamp)
  VALUES

    -- Aug crunch — OT-018 (LabelCorp NeuroCalm)
    (ot_018, 'OT-2025-018', e_carlos, 'Carlos Mendoza', '+56912345678',
     'start',
     'OT-2025-018 | NeuroCalm | Turno inicio 07:10. Ryobi #1 calibrada. Tiro derecho primera pasada OK. Carlos M.',
     '{"ot":"OT-2025-018","machine":"Ryobi #1","operator":"Carlos Mendoza","event":"inicio_turno","time":"07:10","observations":"calibración OK"}',
     'approved', '2025-08-11 07:10:00'),

    (ot_018, 'OT-2025-018', e_carlos, 'Carlos Mendoza', '+56912345678',
     'update',
     'OT-2025-018 | NeuroCalm | 12:45 — 180.000 etiquetas impresas. Sin incidencias. Tinta pantone 485 estable. Carlo M.',
     '{"ot":"OT-2025-018","printed":180000,"time":"12:45","ink_status":"estable","issues":null}',
     'approved', '2025-08-11 12:45:00'),

    (ot_018, 'OT-2025-018', e_carlos, 'Carlos Mendoza', '+56912345678',
     'end',
     'OT-2025-018 | NeuroCalm | Fin turno 15:00. Total día: 420.000 etiquetas. Registro papel OK. Carlos M.',
     '{"ot":"OT-2025-018","total_day":420000,"end_time":"15:00","paper_log":"OK"}',
     'approved', '2025-08-11 15:00:00'),

    -- Aug crunch — OT-021 night shift (Distribuidora Global)
    (ot_021, 'OT-2025-021', e_luis, 'Luis Fernández', '+56923456789',
     'start',
     'OT-2025-021 | Promo Verano | Noche 15:05. Ryobi #2 lista. Arranque OK. Densidades calibradas. Luis F.',
     '{"ot":"OT-2025-021","machine":"Ryobi #2","shift":"noche","event":"inicio_turno","time":"15:05"}',
     'approved', '2025-08-18 15:05:00'),

    (ot_021, 'OT-2025-021', e_luis, 'Luis Fernández', '+56923456789',
     'update',
     'OT-2025-021 | Promo Verano | 19:30 — STOP por rayaduras en 1.500 etiquetas. Revisando tintero. Luis F.',
     '{"ot":"OT-2025-021","event":"stop_calidad","time":"19:30","affected":1500,"cause":"rayaduras_tintero"}',
     'approved', '2025-08-18 19:30:00'),

    (ot_021, 'OT-2025-021', e_luis, 'Luis Fernández', '+56923456789',
     'update',
     'OT-2025-021 | Promo Verano | 20:10 — Reanudado. Tintero limpio. Muestra OK supervisor. Luis F.',
     '{"ot":"OT-2025-021","event":"reanudacion","time":"20:10","downtime_minutes":40,"resolution":"limpieza_tintero"}',
     'approved', '2025-08-18 20:10:00'),

    -- Nov crunch — OT-034 (LabelCorp, Jorge en Ryobi #1 cubriendo a Carlos)
    (ot_034, 'OT-2025-034', e_jorge, 'Jorge Ríos', '+56934567890',
     'start',
     'OT-2025-034 | NeuroCalm Q2 | 07:20. Tomando máquina #1 por licencia Carlos. Calibración extendida 25min. Jorge R.',
     '{"ot":"OT-2025-034","machine":"Ryobi #1","operator":"Jorge Ríos","note":"cobertura_carlos","calibration_extra_min":25}',
     'approved', '2025-11-10 07:20:00'),

    (ot_034, 'OT-2025-034', e_jorge, 'Jorge Ríos', '+56934567890',
     'update',
     'OT-2025-034 | NeuroCalm Q2 | 14:00 — 550.000 etiqtas. Pantone OK. Velocidad 80% (ajustando). Jorge R.',
     '{"ot":"OT-2025-034","printed":550000,"speed_pct":80,"ink_status":"OK","time":"14:00"}',
     'approved', '2025-11-10 14:00:00'),

    -- Nov crunch — OT-037 night shift (Distribuidora 6M)
    (ot_037, 'OT-2025-037', e_luis, 'Luis Fernández', '+56923456789',
     'start',
     'OT-2025-037 | Promo Navidad | Noche 17 Nov 15:00. 6 millones de etiquetas. Vamos. Luis F.',
     '{"ot":"OT-2025-037","shift":"noche","date":"2025-11-17","target":6000000}',
     'approved', '2025-11-17 15:00:00'),

    (ot_037, 'OT-2025-037', e_luis, 'Luis Fernández', '+56923456789',
     'update',
     'OT-2025-037 | Promo Navidad | 22:00 — 380.000 etiqtas noche de hoy. Acumulado 2.1M. Luis F.',
     '{"ot":"OT-2025-037","tonight":380000,"cumulative":2100000,"time":"22:00"}',
     'approved', '2025-11-17 22:00:00'),

    -- Mar 2026 BREAKDOWN — OT-011
    (ot_011, 'OT-2026-011', e_carlos, 'Carlos Mendoza', '+56912345678',
     'start',
     'OT-2026-011 | NeuroCalm Q3 | 07:10. Inicio crunch Q3. Ryobi #1 excelente. Carlos M.',
     '{"ot":"OT-2026-011","event":"inicio_turno","machine":"Ryobi #1","status":"excelente"}',
     'approved', '2026-03-09 07:10:00'),

    (ot_011, 'OT-2026-011', e_carlos, 'Carlos Mendoza', '+56912345678',
     'update',
     'OT-2026-011 | NeuroCalm Q3 | 09:30 PARO MAQUINA. Ruido anormal cojinete derecho. '
     'Detengo Ryobi #1 para revision. Carlos M.',
     '{"ot":"OT-2026-011","event":"paro_emergencia","time":"09:30","cause":"ruido_cojinete","machine":"Ryobi #1","severity":"high"}',
     'approved', '2026-03-11 09:30:00'),

    (ot_011, 'OT-2026-011', e_carlos, 'Carlos Mendoza', '+56912345678',
     'update',
     'OT-2026-011 | NeuroCalm Q3 | 14:05 — Ryobi #1 operativa. Tecnico Impresiones S.A. reemplazo '
     'cojinete. Reanudo produccion. 30% pendiente re-agendado en Ryobi #2 con Jorge. Carlos M.',
     '{"ot":"OT-2026-011","event":"reanudacion","time":"14:05","repair":"cojinete_principal","technician":"Impresiones S.A.","pending_pct":30}',
     'approved', '2026-03-13 14:05:00'),

    -- Mar 2026 — OT-013 night shift
    (ot_013, 'OT-2026-013', e_jorge, 'Jorge Ríos', '+56934567890',
     'start',
     'OT-2026-013 | HogarMax Q3 | Noche 14 Mar 15:05. 600K subcontratadas a Veloz. '
     'Nosotros 1.8M. Jorge R.',
     '{"ot":"OT-2026-013","shift":"noche","subcontract_units":600000,"in_house_units":1800000}',
     'approved', '2026-03-14 15:05:00'),

    -- General quality log (unreviewed — simulates pending review state)
    (ot_014, 'OT-2026-014', e_luis, 'Luis Fernández', '+56923456789',
     'update',
     'OT-2026-014 | Promo Primavera | 21:45 — 750.000 etiqtas. Todo OK. Luis F.',
     '{"ot":"OT-2026-014","printed":750000,"time":"21:45"}',
     'pending', '2026-03-17 21:45:00')

  ON CONFLICT DO NOTHING;

END $$;

-- ============================================================
-- SEED 02 — People & HR
-- 20 employees: management, press operators, pre-press,
-- die-cutting, guillotine, manual finishing, warehouse, delivery
--
-- Run order: 02 of 07
-- Depends on: 01 (workstations), HR migrations (employees, workers,
--             contracts, compensation_rates, skills, shifts tables)
-- Safe to re-run: YES (ON CONFLICT DO NOTHING throughout)
-- ============================================================

-- ── 1. Shifts ────────────────────────────────────────────────
-- TINKER TIP: is_night_shift=true triggers the night_differential
-- multiplier in compensation calculations. Try setting it to
-- check how the cost timeline function reacts.
INSERT INTO public.shifts (name, start_time, end_time, is_night_shift)
VALUES
  ('Turno Mañana',   '07:00', '15:00', false),
  ('Turno Tarde',    '15:00', '23:00', false),
  ('Turno Noche',    '23:00', '07:00', true)
ON CONFLICT DO NOTHING;

-- ── 2. Workers (legacy table) + Employees (current source of truth) ─
-- We insert both and cross-link via worker_legacy_id.
-- EDUCATIONAL NOTE: The HR domain unification (migration 20260222133000)
-- moved performance metrics from workers → employees. The workers table
-- remains for backward compatibility with older task_logs.

DO $$
DECLARE
  -- Worker IDs
  w_eduardo UUID; w_valentina UUID;
  w_carlos  UUID; w_jorge     UUID; w_luis   UUID;
  w_patricia UUID; w_andrea   UUID;
  w_miguel  UUID;
  w_roberto UUID; w_felipe    UUID; w_sebastian UUID;
  w_maria   UUID; w_ana       UUID; w_carmen UUID;
  w_jose    UUID; w_daniel    UUID; w_isabel UUID;
  w_ricardo UUID; w_pablo     UUID; w_claudia UUID;
  -- Employee IDs (returned from INSERT)
  e_eduardo UUID; e_valentina UUID;
  e_carlos  UUID; e_jorge     UUID; e_luis   UUID;
  e_patricia UUID; e_andrea   UUID;
  e_miguel  UUID;
  e_roberto UUID; e_felipe    UUID; e_sebastian UUID;
  e_maria   UUID; e_ana       UUID; e_carmen UUID;
  e_jose    UUID; e_daniel    UUID; e_isabel UUID;
  e_ricardo UUID; e_pablo     UUID; e_claudia UUID;
  -- Skill IDs
  s_press_adv UUID; s_press_bas UUID; s_gui_adv UUID; s_gui_bas UUID;
  s_die UUID; s_prepress UUID; s_color UUID; s_manual UUID;
  s_quality UUID; s_maintenance UUID; s_forklift UUID; s_leadership UUID;
BEGIN

  -- ── Fetch skill IDs ─────────────────────────────────────
  SELECT id INTO s_press_adv  FROM public.skills WHERE code = 'OFFSET_PRESS_ADVANCED';
  SELECT id INTO s_press_bas  FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC';
  SELECT id INTO s_gui_adv    FROM public.skills WHERE code = 'GUILLOTINE_ADVANCED';
  SELECT id INTO s_gui_bas    FROM public.skills WHERE code = 'GUILLOTINE_BASIC';
  SELECT id INTO s_die        FROM public.skills WHERE code = 'DIE_CUTTING';
  SELECT id INTO s_prepress   FROM public.skills WHERE code = 'PRE_PRESS_SETUP';
  SELECT id INTO s_color      FROM public.skills WHERE code = 'COLOR_MANAGEMENT';
  SELECT id INTO s_manual     FROM public.skills WHERE code = 'MANUAL_WORKSHOP';
  SELECT id INTO s_quality    FROM public.skills WHERE code = 'QUALITY_INSPECTION';
  SELECT id INTO s_maintenance FROM public.skills WHERE code = 'MACHINE_MAINTENANCE';
  SELECT id INTO s_forklift   FROM public.skills WHERE code = 'FORKLIFT_CERTIFIED';
  SELECT id INTO s_leadership FROM public.skills WHERE code = 'TEAM_LEADERSHIP';

  -- ── Insert workers (legacy) ──────────────────────────────
  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Eduardo Reyes',    'Management',    0,   90, true, 98, 92, 88, 90) ON CONFLICT DO NOTHING RETURNING id INTO w_eduardo;
  IF w_eduardo IS NULL THEN SELECT id INTO w_eduardo FROM public.workers WHERE name = 'Eduardo Reyes' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Valentina Cruz',   'Management',    0,   95, false,100, 95, 90, 93) ON CONFLICT DO NOTHING RETURNING id INTO w_valentina;
  IF w_valentina IS NULL THEN SELECT id INTO w_valentina FROM public.workers WHERE name = 'Valentina Cruz' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Carlos Muñoz',     'Impresión Offset', 7500, 88, true, 96, 94, 95, 94) ON CONFLICT DO NOTHING RETURNING id INTO w_carlos;
  IF w_carlos IS NULL THEN SELECT id INTO w_carlos FROM public.workers WHERE name = 'Carlos Muñoz' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Jorge Herrera',    'Impresión Offset', 7200, 85, true, 94, 91, 92, 92) ON CONFLICT DO NOTHING RETURNING id INTO w_jorge;
  IF w_jorge IS NULL THEN SELECT id INTO w_jorge FROM public.workers WHERE name = 'Jorge Herrera' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Luis Vargas',      'Impresión Offset', 6500, 80, true, 91, 82, 85, 83) ON CONFLICT DO NOTHING RETURNING id INTO w_luis;
  IF w_luis IS NULL THEN SELECT id INTO w_luis FROM public.workers WHERE name = 'Luis Vargas' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Patricia Rojas',   'Pre-Prensa', 0, 90, false, 99, 96, 88, 94) ON CONFLICT DO NOTHING RETURNING id INTO w_patricia;
  IF w_patricia IS NULL THEN SELECT id INTO w_patricia FROM public.workers WHERE name = 'Patricia Rojas' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Andrea Soto',      'Pre-Prensa', 0, 88, false, 97, 93, 85, 91) ON CONFLICT DO NOTHING RETURNING id INTO w_andrea;
  IF w_andrea IS NULL THEN SELECT id INTO w_andrea FROM public.workers WHERE name = 'Andrea Soto' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Miguel Fernández', 'Troquelado',  4500, 82, true, 93, 88, 90, 89) ON CONFLICT DO NOTHING RETURNING id INTO w_miguel;
  IF w_miguel IS NULL THEN SELECT id INTO w_miguel FROM public.workers WHERE name = 'Miguel Fernández' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Roberto Castro',   'Corte', 0, 85, true, 95, 87, 88, 87) ON CONFLICT DO NOTHING RETURNING id INTO w_roberto;
  IF w_roberto IS NULL THEN SELECT id INTO w_roberto FROM public.workers WHERE name = 'Roberto Castro' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Felipe Morales',   'Corte', 0, 80, true, 90, 84, 86, 85) ON CONFLICT DO NOTHING RETURNING id INTO w_felipe;
  IF w_felipe IS NULL THEN SELECT id INTO w_felipe FROM public.workers WHERE name = 'Felipe Morales' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Sebastián Torres', 'Corte', 0, 78, true, 88, 82, 83, 82) ON CONFLICT DO NOTHING RETURNING id INTO w_sebastian;
  IF w_sebastian IS NULL THEN SELECT id INTO w_sebastian FROM public.workers WHERE name = 'Sebastián Torres' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('María González',   'Terminaciones', 0, 92, false, 98, 89, 82, 88) ON CONFLICT DO NOTHING RETURNING id INTO w_maria;
  IF w_maria IS NULL THEN SELECT id INTO w_maria FROM public.workers WHERE name = 'María González' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Ana Martínez',     'Terminaciones', 0, 90, true, 96, 87, 80, 86) ON CONFLICT DO NOTHING RETURNING id INTO w_ana;
  IF w_ana IS NULL THEN SELECT id INTO w_ana FROM public.workers WHERE name = 'Ana Martínez' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Carmen López',     'Terminaciones', 0, 88, false, 95, 86, 79, 85) ON CONFLICT DO NOTHING RETURNING id INTO w_carmen;
  IF w_carmen IS NULL THEN SELECT id INTO w_carmen FROM public.workers WHERE name = 'Carmen López' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('José Silva',       'Terminaciones', 0, 82, true, 92, 83, 78, 83) ON CONFLICT DO NOTHING RETURNING id INTO w_jose;
  IF w_jose IS NULL THEN SELECT id INTO w_jose FROM public.workers WHERE name = 'José Silva' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Daniel Pérez',     'Terminaciones', 0, 80, true, 89, 80, 77, 81) ON CONFLICT DO NOTHING RETURNING id INTO w_daniel;
  IF w_daniel IS NULL THEN SELECT id INTO w_daniel FROM public.workers WHERE name = 'Daniel Pérez' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Isabel Ramos',     'Terminaciones', 0, 85, true, 93, 85, 80, 84) ON CONFLICT DO NOTHING RETURNING id INTO w_isabel;
  IF w_isabel IS NULL THEN SELECT id INTO w_isabel FROM public.workers WHERE name = 'Isabel Ramos' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Ricardo Núñez',    'Bodega', 0, 88, true, 97, 88, 85, 87) ON CONFLICT DO NOTHING RETURNING id INTO w_ricardo;
  IF w_ricardo IS NULL THEN SELECT id INTO w_ricardo FROM public.workers WHERE name = 'Ricardo Núñez' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Pablo Díaz',       'Despacho', 0, 85, true, 94, 85, 88, 86) ON CONFLICT DO NOTHING RETURNING id INTO w_pablo;
  IF w_pablo IS NULL THEN SELECT id INTO w_pablo FROM public.workers WHERE name = 'Pablo Díaz' LIMIT 1; END IF;

  INSERT INTO public.workers (name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, quality_score, speed_score, overall_rating)
  VALUES ('Claudia Fuentes',  'Despacho', 0, 87, false, 96, 86, 87, 87) ON CONFLICT DO NOTHING RETURNING id INTO w_claudia;
  IF w_claudia IS NULL THEN SELECT id INTO w_claudia FROM public.workers WHERE name = 'Claudia Fuentes' LIMIT 1; END IF;

  -- ── Insert employees (source of truth) ──────────────────
  -- employee_code: EMP-XXX  |  department matches workers
  -- TINKER TIP: Change status to 'on_leave' for Carlos in Nov-25 crunch
  -- to see how the scheduling compliance system handles understaffing.

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-001','Eduardo Reyes','Management','active','2019-03-01',
    'eduardo.reyes@imprentacentral.cl','+56 9 8100 0001', w_eduardo,
    0,90,true,98,92,88,90,'Supervisor de planta. 7 años en el taller. Conoce cada máquina de memoria.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_eduardo;
  IF e_eduardo IS NULL THEN SELECT id INTO e_eduardo FROM public.employees WHERE employee_code = 'EMP-001'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-002','Valentina Cruz','Management','active','2020-07-15',
    'valentina.cruz@imprentacentral.cl','+56 9 8100 0002', w_valentina,
    0,95,false,100,95,90,93,'Gerente de operaciones. MBA. Responsable de pricing y relación con clientes clave.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_valentina;
  IF e_valentina IS NULL THEN SELECT id INTO e_valentina FROM public.employees WHERE employee_code = 'EMP-002'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-003','Carlos Muñoz','Impresión Offset','active','2018-01-08',
    'carlos.munoz@imprentacentral.cl','+56 9 8100 0003', w_carlos,
    7500,88,true,96,94,95,94,'Operador senior Ryobi #1. 8 años. Experto en registro y mezcla de colores Pantone. '
    'Licencia por enfermedad Nov-25 (2 semanas) → activa protocolo crunch.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_carlos;
  IF e_carlos IS NULL THEN SELECT id INTO e_carlos FROM public.employees WHERE employee_code = 'EMP-003'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-004','Jorge Herrera','Impresión Offset','active','2018-06-01',
    'jorge.herrera@imprentacentral.cl','+56 9 8100 0004', w_jorge,
    7200,85,true,94,91,92,92,'Operador senior Ryobi #2. Especialista en barniz UV y laminado. '
    'Cubre Ryobi #1 durante avería Mar-26.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_jorge;
  IF e_jorge IS NULL THEN SELECT id INTO e_jorge FROM public.employees WHERE employee_code = 'EMP-004'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-005','Luis Vargas','Impresión Offset','active','2024-03-01',
    'luis.vargas@imprentacentral.cl','+56 9 8100 0005', w_luis,
    6500,80,true,91,82,85,83,'Operador en formación. Contratado para cubrir crecimiento. '
    'Toma Ryobi #2 en turno tarde durante crunches.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_luis;
  IF e_luis IS NULL THEN SELECT id INTO e_luis FROM public.employees WHERE employee_code = 'EMP-005'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-006','Patricia Rojas','Pre-Prensa','active','2019-09-01',
    'patricia.rojas@imprentacentral.cl','+56 9 8100 0006', w_patricia,
    0,90,false,99,96,88,94,'Técnica de pre-prensa. Exposición CTP, corrección de color, imposición digital.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_patricia;
  IF e_patricia IS NULL THEN SELECT id INTO e_patricia FROM public.employees WHERE employee_code = 'EMP-006'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-007','Andrea Soto','Pre-Prensa','active','2021-02-01',
    'andrea.soto@imprentacentral.cl','+56 9 8100 0007', w_andrea,
    0,88,false,97,93,85,91,'Diseñadora/pre-prensa. Arte final, separación de colores, archivos Pantone LabelCorp.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_andrea;
  IF e_andrea IS NULL THEN SELECT id INTO e_andrea FROM public.employees WHERE employee_code = 'EMP-007'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-008','Miguel Fernández','Troquelado','active','2020-04-15',
    'miguel.fernandez@imprentacentral.cl','+56 9 8100 0008', w_miguel,
    4500,82,true,93,88,90,89,'Operador Bobst SP 102-E. Troquel-hendido-perforado simultáneo. '
    'Crítico para cajas plegadizas PackBrands.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_miguel;
  IF e_miguel IS NULL THEN SELECT id INTO e_miguel FROM public.employees WHERE employee_code = 'EMP-008'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-009','Roberto Castro','Corte','active','2019-11-01',
    'roberto.castro@imprentacentral.cl','+56 9 8100 0009', w_roberto,
    0,85,true,95,87,88,87,'Operador jefe guillotinas. Programa cortes y secuencias. Polar 115.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_roberto;
  IF e_roberto IS NULL THEN SELECT id INTO e_roberto FROM public.employees WHERE employee_code = 'EMP-009'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-010','Felipe Morales','Corte','active','2021-06-01',
    'felipe.morales@imprentacentral.cl','+56 9 8100 0010', w_felipe,
    0,80,true,90,84,86,85,'Operador Polar 92. Segundo en guillotinas.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_felipe;
  IF e_felipe IS NULL THEN SELECT id INTO e_felipe FROM public.employees WHERE employee_code = 'EMP-010'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-011','Sebastián Torres','Corte','active','2024-05-01',
    'sebastian.torres@imprentacentral.cl','+56 9 8100 0011', w_sebastian,
    0,78,true,88,82,83,82,'Operador Ideal 7228. Nuevo en corte fino.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_sebastian;
  IF e_sebastian IS NULL THEN SELECT id INTO e_sebastian FROM public.employees WHERE employee_code = 'EMP-011'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-012','María González','Terminaciones','active','2020-01-06',
    'maria.gonzalez@imprentacentral.cl','+56 9 8100 0012', w_maria,
    0,92,false,98,89,82,88,'Jefa de terminaciones manuales. Estándar de calidad.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_maria;
  IF e_maria IS NULL THEN SELECT id INTO e_maria FROM public.employees WHERE employee_code = 'EMP-012'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-013','Ana Martínez','Terminaciones','active','2021-03-15',
    'ana.martinez@imprentacentral.cl','+56 9 8100 0013', w_ana,
    0,90,true,96,87,80,86,'Terminaciones — pegado y empaque.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_ana;
  IF e_ana IS NULL THEN SELECT id INTO e_ana FROM public.employees WHERE employee_code = 'EMP-013'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-014','Carmen López','Terminaciones','active','2022-07-01',
    'carmen.lopez@imprentacentral.cl','+56 9 8100 0014', w_carmen,
    0,88,false,95,86,79,85,'Terminaciones — doblado y revisión.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_carmen;
  IF e_carmen IS NULL THEN SELECT id INTO e_carmen FROM public.employees WHERE employee_code = 'EMP-014'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-015','José Silva','Terminaciones','active','2022-09-01',
    'jose.silva@imprentacentral.cl','+56 9 8100 0015', w_jose,
    0,82,true,92,83,78,83,'Terminaciones — numeración y embalaje.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_jose;
  IF e_jose IS NULL THEN SELECT id INTO e_jose FROM public.employees WHERE employee_code = 'EMP-015'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-016','Daniel Pérez','Terminaciones','active','2023-02-01',
    'daniel.perez@imprentacentral.cl','+56 9 8100 0016', w_daniel,
    0,80,true,89,80,77,81,'Terminaciones — empaque y control final.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_daniel;
  IF e_daniel IS NULL THEN SELECT id INTO e_daniel FROM public.employees WHERE employee_code = 'EMP-016'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-017','Isabel Ramos','Terminaciones','active','2023-05-15',
    'isabel.ramos@imprentacentral.cl','+56 9 8100 0017', w_isabel,
    0,85,true,93,85,80,84,'Terminaciones — rebobinado de etiquetas autoadhesivas.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_isabel;
  IF e_isabel IS NULL THEN SELECT id INTO e_isabel FROM public.employees WHERE employee_code = 'EMP-017'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-018','Ricardo Núñez','Bodega','active','2020-10-01',
    'ricardo.nunez@imprentacentral.cl','+56 9 8100 0018', w_ricardo,
    0,88,true,97,88,85,87,'Bodeguero. Recepción papel/insumos, inventario, despacho a planta. Montacargas certificado.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_ricardo;
  IF e_ricardo IS NULL THEN SELECT id INTO e_ricardo FROM public.employees WHERE employee_code = 'EMP-018'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-019','Pablo Díaz','Despacho','active','2021-08-01',
    'pablo.diaz@imprentacentral.cl','+56 9 8100 0019', w_pablo,
    0,85,true,94,85,88,86,'Conductor furgón principal. Zona Metropolitana y urgentes. Conoce rutas LabelCorp y PackBrands.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_pablo;
  IF e_pablo IS NULL THEN SELECT id INTO e_pablo FROM public.employees WHERE employee_code = 'EMP-019'; END IF;

  INSERT INTO public.employees (employee_code, full_name, department, status, hire_date, email, phone,
    worker_legacy_id, sheets_per_hour, teamwork_rating, overtime_availability,
    attendance_score, quality_score, speed_score, overall_rating, notes)
  VALUES ('EMP-020','Claudia Fuentes','Despacho','active','2022-01-03',
    'claudia.fuentes@imprentacentral.cl','+56 9 8100 0020', w_claudia,
    0,87,false,96,86,87,87,'Conductora furgón regiones. Cobertura Valparaíso-Santiago-O''Higgins.')
  ON CONFLICT (employee_code) DO NOTHING RETURNING id INTO e_claudia;
  IF e_claudia IS NULL THEN SELECT id INTO e_claudia FROM public.employees WHERE employee_code = 'EMP-020'; END IF;

  -- ── Employment contracts ──────────────────────────────────
  -- TINKER TIP: Change overtime_allowed=false for a press operator to see
  -- how validate_worker_assignment_compliance() rejects overtime assignments.
  INSERT INTO public.employment_contracts (employee_id, contract_type, start_date,
    base_hours_per_week, max_hours_per_day, max_hours_per_week,
    overtime_allowed, overtime_cap_hours_per_week, minimum_rest_hours, is_active)
  VALUES
    (e_eduardo,    'full_time', '2019-03-01',  40, 9, 50, true,  10, 12, true),
    (e_valentina,  'full_time', '2020-07-15',  40, 8, 48, false,  0, 12, true),
    (e_carlos,     'full_time', '2018-01-08',  40, 10,52, true,  12, 11, true),
    (e_jorge,      'full_time', '2018-06-01',  40, 10,52, true,  12, 11, true),
    (e_luis,       'full_time', '2024-03-01',  40, 9, 50, true,  10, 12, true),
    (e_patricia,   'full_time', '2019-09-01',  40, 8, 48, false,  0, 12, true),
    (e_andrea,     'full_time', '2021-02-01',  40, 8, 48, false,  0, 12, true),
    (e_miguel,     'full_time', '2020-04-15',  40, 10,52, true,  12, 11, true),
    (e_roberto,    'full_time', '2019-11-01',  40, 9, 50, true,  10, 12, true),
    (e_felipe,     'full_time', '2021-06-01',  40, 9, 50, true,  10, 12, true),
    (e_sebastian,  'full_time', '2024-05-01',  40, 9, 50, true,  10, 12, true),
    (e_maria,      'full_time', '2020-01-06',  40, 8, 48, false,  0, 12, true),
    (e_ana,        'full_time', '2021-03-15',  40, 9, 50, true,  10, 12, true),
    (e_carmen,     'full_time', '2022-07-01',  40, 8, 48, false,  0, 12, true),
    (e_jose,       'full_time', '2022-09-01',  40, 9, 50, true,  10, 12, true),
    (e_daniel,     'full_time', '2023-02-01',  40, 9, 50, true,  10, 12, true),
    (e_isabel,     'full_time', '2023-05-15',  40, 9, 50, true,  10, 12, true),
    (e_ricardo,    'full_time', '2020-10-01',  40, 9, 50, true,  10, 12, true),
    (e_pablo,      'full_time', '2021-08-01',  40, 9, 50, true,  10, 12, true),
    (e_claudia,    'full_time', '2022-01-03',  40, 8, 48, false,  0, 12, true);

  -- ── Compensation rates ────────────────────────────────────
  -- Hourly rates in USD. OT multipliers per Chilean labor law:
  --   50% extra for first 2h/day, 100% for hours beyond that.
  -- TINKER TIP: Raise carlos/jorge hourly_rate to model senior pay raise.
  INSERT INTO public.compensation_rates (employee_id, effective_from, hourly_rate,
    currency_code, overtime_multiplier_50, overtime_multiplier_100,
    night_shift_multiplier, weekend_multiplier, incentive_eligibility)
  VALUES
    (e_eduardo,   '2019-03-01', 18.50, 'USD', 1.50, 2.00, 1.30, 1.50, true),
    (e_valentina, '2020-07-15', 22.00, 'USD', 1.50, 2.00, 1.00, 1.00, false),
    (e_carlos,    '2018-01-08', 16.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_jorge,     '2018-06-01', 15.50, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_luis,      '2024-03-01', 12.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_patricia,  '2019-09-01', 14.00, 'USD', 1.50, 2.00, 1.00, 1.00, true),
    (e_andrea,    '2021-02-01', 13.50, 'USD', 1.50, 2.00, 1.00, 1.00, true),
    (e_miguel,    '2020-04-15', 12.50, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_roberto,   '2019-11-01', 11.50, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_felipe,    '2021-06-01', 11.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_sebastian, '2024-05-01', 10.50, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_maria,     '2020-01-06',  9.50, 'USD', 1.50, 2.00, 1.00, 1.00, true),
    (e_ana,       '2021-03-15',  9.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_carmen,    '2022-07-01',  9.00, 'USD', 1.50, 2.00, 1.00, 1.00, true),
    (e_jose,      '2022-09-01',  9.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_daniel,    '2023-02-01',  9.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_isabel,    '2023-05-15',  9.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_ricardo,   '2020-10-01', 10.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_pablo,     '2021-08-01', 10.00, 'USD', 1.50, 2.00, 1.35, 1.50, true),
    (e_claudia,   '2022-01-03', 10.00, 'USD', 1.50, 2.00, 1.00, 1.00, true);

  -- ── Employee skills ───────────────────────────────────────
  -- proficiency: 1=beginner, 2=developing, 3=proficient, 4=expert, 5=master
  -- TINKER TIP: Lower carlos proficiency on COLOR_MANAGEMENT and watch
  -- how the scheduling cost model penalises the assignment.
  IF s_press_adv IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_carlos,   s_press_adv, 5, '2022-01-15'),
      (e_jorge,    s_press_adv, 4, '2022-06-01'),
      (e_luis,     s_press_bas, 3, '2024-08-01'),
      (e_eduardo,  s_press_bas, 3, '2021-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_gui_adv IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_roberto,  s_gui_adv, 5, '2021-11-01'),
      (e_felipe,   s_gui_adv, 3, '2022-06-01'),
      (e_sebastian,s_gui_bas, 2, '2024-09-01'),
      (e_eduardo,  s_gui_bas, 3, '2021-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_die IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_miguel,   s_die, 5, '2021-04-15'),
      (e_roberto,  s_die, 3, '2022-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_prepress IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_patricia, s_prepress, 5, '2020-09-01'),
      (e_andrea,   s_prepress, 4, '2022-02-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_color IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_carlos,   s_color, 5, '2021-03-01'),
      (e_patricia, s_color, 5, '2020-09-01'),
      (e_andrea,   s_color, 4, '2022-03-01'),
      (e_jorge,    s_color, 4, '2020-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_manual IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_maria,    s_manual, 5, '2020-06-01'),
      (e_ana,      s_manual, 4, '2021-09-01'),
      (e_carmen,   s_manual, 4, '2022-12-01'),
      (e_jose,     s_manual, 3, '2023-03-01'),
      (e_daniel,   s_manual, 3, '2023-08-01'),
      (e_isabel,   s_manual, 3, '2023-11-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_leadership IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_eduardo,  s_leadership, 5, '2021-01-01'),
      (e_valentina,s_leadership, 5, '2020-07-15'),
      (e_carlos,   s_leadership, 3, '2023-01-01'),
      (e_maria,    s_leadership, 3, '2022-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_forklift IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_ricardo,  s_forklift, 5, '2020-10-15'),
      (e_pablo,    s_forklift, 4, '2021-09-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  IF s_maintenance IS NOT NULL THEN
    INSERT INTO public.employee_skills (employee_id, skill_id, proficiency_level, last_assessed_on)
    VALUES
      (e_carlos,   s_maintenance, 4, '2021-01-01'),
      (e_jorge,    s_maintenance, 4, '2021-01-01'),
      (e_miguel,   s_maintenance, 3, '2022-01-01'),
      (e_eduardo,  s_maintenance, 4, '2021-01-01')
    ON CONFLICT (employee_id, skill_id) DO NOTHING;
  END IF;

  -- ── Leave balances (as of 2025-05-01) ────────────────────
  -- TINKER TIP: Set carlos vacation balance to 0 and check if
  -- leave approval is blocked by the policy engine.
  INSERT INTO public.leave_balances (employee_id, leave_type, balance_hours,
    accrued_hours, used_hours, carry_over_hours, as_of, balance_year,
    accrual_rate_per_month, max_balance_hours, last_accrued_on)
  VALUES
    -- Eduardo — 6 years → 120h vacation accrued
    (e_eduardo, 'vacation', 120, 120,  0, 40, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_eduardo, 'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Valentina
    (e_valentina,'vacation', 96,  96,  0, 16, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_valentina,'sick',     40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Carlos — 7 years; has 16h used for sick in 2024
    (e_carlos,  'vacation', 104, 104,  0, 24, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_carlos,  'sick',      24,  40, 16,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Jorge
    (e_jorge,   'vacation',  88,  88,  0,  8, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_jorge,   'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Luis (new hire, few benefits)
    (e_luis,    'vacation',  16,  16,  0,  0, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_luis,    'sick',      12,  12,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Patricia
    (e_patricia,'vacation',  80,  80,  0, 16, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_patricia,'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Andrea
    (e_andrea,  'vacation',  56,  56,  0,  8, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_andrea,  'sick',      32,  32,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    -- Remaining employees (standard balances for brevity)
    (e_miguel,  'vacation',  72,  72,  0,  8, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_miguel,  'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    (e_roberto, 'vacation',  80,  80,  0,  0, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_roberto, 'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    (e_felipe,  'vacation',  48,  48,  0,  0, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_felipe,  'sick',      32,  32,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    (e_maria,   'vacation',  80,  80,  0, 16, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_maria,   'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30'),
    (e_ricardo, 'vacation',  72,  72,  0,  0, '2025-05-01', 2025, 8.0, 200, '2025-04-30'),
    (e_ricardo, 'sick',      40,  40,  0,  0, '2025-05-01', 2025, 4.0,  80, '2025-04-30')
  ON CONFLICT (employee_id, leave_type, as_of) DO NOTHING;

  -- ── Leave requests (educational scenarios) ───────────────
  -- SCENARIO A: Carlos sick leave during Nov-25 crunch → press understaffed
  -- SCENARIO B: Patricia vacation Jan-26 → pre-press covered by Andrea
  INSERT INTO public.leave_requests (employee_id, leave_type, status,
    start_date, end_date, hours_requested, reason)
  VALUES
    (e_carlos,   'sick',     'approved', '2025-11-10', '2025-11-21', 80,
     'Diagnóstico: gastroenteritis severa. Médico indica reposo 2 semanas. '
     'IMPACTO: Ryobi #1 queda con Jorge+Luis en pleno crunch Q2.'),
    (e_patricia, 'vacation', 'approved', '2026-01-05', '2026-01-16', 80,
     'Vacaciones planificadas. Andrea cubre pre-prensa.')
  ON CONFLICT DO NOTHING;

  -- ── Incentive awards ─────────────────────────────────────
  -- Show the incentive module in use across the year
  DECLARE
    ir_attendance UUID; ir_quality UUID; ir_ot_std UUID;
  BEGIN
    SELECT id INTO ir_attendance FROM public.incentive_rules WHERE name = 'Perfect Attendance Bonus'    LIMIT 1;
    SELECT id INTO ir_quality    FROM public.incentive_rules WHERE name = 'Quality Excellence Bonus'   LIMIT 1;

    IF ir_attendance IS NOT NULL THEN
      INSERT INTO public.employee_incentives (employee_id, incentive_rule_id, awarded_date,
        period_start, period_end, amount, currency_code, status, notes)
      VALUES
        (e_maria,   ir_attendance, '2025-06-01', '2025-05-01', '2025-05-31', 100, 'USD', 'approved', 'Asistencia perfecta Mayo 2025'),
        (e_patricia,ir_attendance, '2025-06-01', '2025-05-01', '2025-05-31', 100, 'USD', 'approved', 'Asistencia perfecta Mayo 2025'),
        (e_roberto, ir_attendance, '2025-09-01', '2025-08-01', '2025-08-31', 100, 'USD', 'approved', 'Asistencia perfecta crunch Ago 2025'),
        (e_jorge,   ir_attendance, '2025-12-01', '2025-11-01', '2025-11-30', 100, 'USD', 'approved', 'Asistencia perfecta crunch Nov 2025 (cubrió Ryobi#1)'),
        (e_miguel,  ir_attendance, '2026-04-01', '2026-03-01', '2026-03-31', 100, 'USD', 'approved', 'Asistencia perfecta crunch Mar 2026')
      ON CONFLICT DO NOTHING;
    END IF;

    IF ir_quality IS NOT NULL THEN
      INSERT INTO public.employee_incentives (employee_id, incentive_rule_id, awarded_date,
        period_start, period_end, amount, currency_code, status, notes)
      VALUES
        (e_carlos,  ir_quality, '2025-08-01', '2025-05-01', '2025-07-31', 250, 'USD', 'approved', 'Q1 2025 — cero rechazos en etiquetas LabelCorp'),
        (e_jorge,   ir_quality, '2026-01-01', '2025-10-01', '2025-12-31', 250, 'USD', 'approved', 'Q3 2025 — calidad sobresaliente cubriendo prensa #1'),
        (e_patricia,ir_quality, '2026-01-01', '2025-10-01', '2025-12-31', 250, 'USD', 'approved', 'Q3 2025 — pre-prensa sin errores de archivo')
      ON CONFLICT DO NOTHING;
    END IF;
  END;

END $$;

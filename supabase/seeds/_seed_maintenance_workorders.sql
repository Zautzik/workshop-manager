-- Seed: maintenance_checklists + maintenance_work_orders + maintenance_programs + program_tasks
-- Populates what the UI actually reads (historial, alertas, ordenes, programa pages)

DO $$
DECLARE
  m_r1 UUID; m_r2 UUID; m_dc UUID; m_g1 UUID; m_g2 UUID; m_g3 UUID;
  cl_r_weekly UUID; cl_r_monthly UUID; cl_r_qtly UUID;
  cl_g_qtly UUID; cl_dc_monthly UUID;
  prog_ryobi UUID; prog_guillo UUID;
BEGIN
  SELECT id INTO m_r1 FROM public.machines WHERE name = 'Ryobi Offset 524GS #1' LIMIT 1;
  SELECT id INTO m_r2 FROM public.machines WHERE name = 'Ryobi Offset 524GS #2' LIMIT 1;
  SELECT id INTO m_dc FROM public.machines WHERE name = 'Troqueladora'           LIMIT 1;
  SELECT id INTO m_g1 FROM public.machines WHERE name = 'Guillotine #1'          LIMIT 1;
  SELECT id INTO m_g2 FROM public.machines WHERE name = 'Guillotine #2'          LIMIT 1;
  SELECT id INTO m_g3 FROM public.machines WHERE name = 'Guillotine #3'          LIMIT 1;

  IF m_r1 IS NULL THEN RAISE NOTICE 'machines not found, skipping'; RETURN; END IF;

  -- Clean prior runs (FK order)
  DELETE FROM public.maintenance_task_completions
    WHERE work_order_id IN (
      SELECT id FROM public.maintenance_work_orders
      WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3)
    );
  DELETE FROM public.maintenance_work_orders
    WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3);
  DELETE FROM public.maintenance_tasks
    WHERE checklist_id IN (
      SELECT id FROM public.maintenance_checklists
      WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3)
    );
  DELETE FROM public.maintenance_checklists
    WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3);
  DELETE FROM public.program_tasks
    WHERE program_id IN (
      SELECT id FROM public.maintenance_programs
      WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2)
    );
  DELETE FROM public.maintenance_programs
    WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2);

  -- CHECKLISTS
  INSERT INTO public.maintenance_checklists
    (machine_id, name, machine_type, frequency, maintenance_type, description, total_estimated_time, items)
  VALUES
    (m_r1, 'PM Semanal - Offset 524GS', 'offset_printer', 'weekly', 'preventive',
     'Rutina semanal lunes pre-turno para impresora offset Ryobi.', 90,
     '[{"order":1,"description":"Limpieza tinteros CMYK","estimated_minutes":20},{"order":2,"description":"Revision mantillas","estimated_minutes":15},{"order":3,"description":"Ajuste registro 0.1mm","estimated_minutes":10},{"order":4,"description":"Lubricacion puntos clave","estimated_minutes":15},{"order":5,"description":"Verificar pH fuente 4.8-5.2","estimated_minutes":10},{"order":6,"description":"Prueba de impresion","estimated_minutes":20}]'::jsonb)
  RETURNING id INTO cl_r_weekly;

  INSERT INTO public.maintenance_checklists
    (machine_id, name, machine_type, frequency, maintenance_type, description, total_estimated_time, items)
  VALUES
    (m_r1, 'PM Mensual - Offset 524GS', 'offset_printer', 'monthly', 'preventive',
     'Revision mensual completa de rodillos, sistema de tintas y calibracion.', 240,
     '[{"order":1,"description":"Revision rodillos entintadores","estimated_minutes":30},{"order":2,"description":"Tension de mantilla","estimated_minutes":20},{"order":3,"description":"Ajuste pH fuente a 5.0","estimated_minutes":10},{"order":4,"description":"Limpieza tablero electrico","estimated_minutes":25},{"order":5,"description":"Calibracion densitometro","estimated_minutes":30},{"order":6,"description":"Revision correas y guias","estimated_minutes":20},{"order":7,"description":"Limpieza profunda tintas","estimated_minutes":40},{"order":8,"description":"Prueba de registro y calidad","estimated_minutes":25},{"order":9,"description":"Actualizar bitacora","estimated_minutes":10}]'::jsonb)
  RETURNING id INTO cl_r_monthly;

  INSERT INTO public.maintenance_checklists
    (machine_id, name, machine_type, frequency, maintenance_type, description, total_estimated_time, items)
  VALUES
    (m_r1, 'PM Trimestral - Offset 524GS', 'offset_printer', 'quarterly', 'preventive',
     'Revision trimestral completa. Requiere tecnico externo Impresiones S.A.', 480,
     '[{"order":1,"description":"Inspeccion cojinetes - medir desgaste","estimated_minutes":60},{"order":2,"description":"Ajuste y lubricacion correas","estimated_minutes":30},{"order":3,"description":"Limpieza profunda sistema tintas","estimated_minutes":60},{"order":4,"description":"Calibracion completa","estimated_minutes":45},{"order":5,"description":"Verificacion electrica tecnico externo","estimated_minutes":90},{"order":6,"description":"Reemplazo partes segun desgaste","estimated_minutes":60},{"order":7,"description":"Prueba de produccion","estimated_minutes":45},{"order":8,"description":"Informe tecnico al supervisor","estimated_minutes":30}]'::jsonb)
  RETURNING id INTO cl_r_qtly;

  INSERT INTO public.maintenance_checklists
    (machine_id, name, machine_type, frequency, maintenance_type, description, total_estimated_time, items)
  VALUES
    (m_g1, 'PM Trimestral - Guillotina', 'guillotine', 'quarterly', 'preventive',
     'Mantenimiento trimestral guillotinas: afilado, seguridad y lubricacion.', 150,
     '[{"order":1,"description":"Verificar guarda de seguridad","estimated_minutes":15},{"order":2,"description":"Afilado o reemplazo cuchilla","estimated_minutes":45},{"order":3,"description":"Lubricacion sistema de corte","estimated_minutes":20},{"order":4,"description":"Calibracion guia de papel","estimated_minutes":25},{"order":5,"description":"Prueba de corte con muestras","estimated_minutes":25},{"order":6,"description":"Registro en bitacora","estimated_minutes":10}]'::jsonb)
  RETURNING id INTO cl_g_qtly;

  INSERT INTO public.maintenance_checklists
    (machine_id, name, machine_type, frequency, maintenance_type, description, total_estimated_time, items)
  VALUES
    (m_dc, 'PM Mensual - Troqueladora', 'die_cutter', 'monthly', 'preventive',
     'Mantenimiento mensual de la troqueladora.', 180,
     '[{"order":1,"description":"Revision cuchillas - desgaste","estimated_minutes":20},{"order":2,"description":"Ajuste de presion objetivo 88 kN/m","estimated_minutes":25},{"order":3,"description":"Limpieza sistema de alimentacion","estimated_minutes":30},{"order":4,"description":"Lubricacion puntos de friccion","estimated_minutes":20},{"order":5,"description":"Verificar alineacion troquel","estimated_minutes":30},{"order":6,"description":"Prueba con material de muestra","estimated_minutes":35},{"order":7,"description":"Actualizar registro","estimated_minutes":10}]'::jsonb)
  RETURNING id INTO cl_dc_monthly;

  IF cl_r_weekly IS NULL OR cl_r_monthly IS NULL OR cl_r_qtly IS NULL THEN
    RAISE EXCEPTION 'checklist IDs not captured';
  END IF;

  -- WORK ORDERS - COMPLETED (historial page)
  INSERT INTO public.maintenance_work_orders
    (checklist_id, machine_id, status, priority, scheduled_date, started_at, completed_at, total_time_minutes, notes)
  VALUES
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-05-05 07:00'::timestamptz, '2025-05-05 07:05'::timestamptz, '2025-05-05 08:35'::timestamptz,  90,  'Rutina semanal. Todo en orden.'),
    (cl_r_monthly,  m_r1, 'completed', 2, '2025-05-05 08:30'::timestamptz, '2025-05-05 08:35'::timestamptz, '2025-05-05 12:30'::timestamptz,  235, 'PM mensual mayo. Ajuste pH a 5.0.'),
    (cl_r_weekly,   m_r2, 'completed', 2, '2025-05-05 07:00'::timestamptz, '2025-05-05 07:05'::timestamptz, '2025-05-05 08:35'::timestamptz,  88,  'Rutina semanal Ryobi #2.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-06-02 07:00'::timestamptz, '2025-06-02 07:05'::timestamptz, '2025-06-02 08:35'::timestamptz,  90,  'Limpieza rutinaria.'),
    (cl_r_monthly,  m_r1, 'completed', 2, '2025-06-02 08:30'::timestamptz, '2025-06-02 08:35'::timestamptz, '2025-06-02 12:35'::timestamptz,  240, 'Cambio mantilla offset x1 ($95). Calibracion OK.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-07-07 07:00'::timestamptz, '2025-07-07 07:05'::timestamptz, '2025-07-07 08:35'::timestamptz,  90,  NULL),
    (cl_r_monthly,  m_r1, 'completed', 2, '2025-07-07 08:30'::timestamptz, '2025-07-07 08:35'::timestamptz, '2025-07-07 13:05'::timestamptz,  270, 'Pre-crunch: lubricacion extra cojinetes.'),
    (cl_r_qtly,     m_r1, 'completed', 1, '2025-07-28 07:00'::timestamptz, '2025-07-28 07:10'::timestamptz, '2025-07-28 15:10'::timestamptz,  480, 'PM trimestral Q2 2025. Tecnico externo. Cojinetes OK. $350.'),
    (cl_r_qtly,     m_r2, 'completed', 1, '2025-07-28 12:00'::timestamptz, '2025-07-28 12:10'::timestamptz, '2025-07-28 20:10'::timestamptz,  480, 'PM trimestral Q2 2025 Ryobi #2. Excelente estado. $320.'),
    (cl_r_weekly,   m_r1, 'completed', 1, '2025-08-04 06:30'::timestamptz, '2025-08-04 06:35'::timestamptz, '2025-08-04 07:35'::timestamptz,  60,  'PM reducido 1h por inicio crunch agosto.'),
    (cl_dc_monthly, m_dc, 'completed', 2, '2025-06-02 09:00'::timestamptz, '2025-06-02 09:05'::timestamptz, '2025-06-02 12:05'::timestamptz,  178, 'PM mensual troqueladora jun. Cuchillas OK.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-09-01 07:00'::timestamptz, '2025-09-01 07:05'::timestamptz, '2025-09-01 08:35'::timestamptz,  90,  'Post-crunch: rodillo entintador #2 rayaduras leves.'),
    (cl_r_monthly,  m_r1, 'completed', 2, '2025-09-01 08:30'::timestamptz, '2025-09-01 08:35'::timestamptz, '2025-09-01 12:35'::timestamptz,  240, 'Ajuste pH. Nota bitacora rodillo #2.'),
    (cl_dc_monthly, m_dc, 'completed', 2, '2025-09-01 09:00'::timestamptz, '2025-09-01 09:05'::timestamptz, '2025-09-01 12:05'::timestamptz,  180, 'Reemplazo cuchilla inferior x1 ($210).'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-10-06 07:00'::timestamptz, '2025-10-06 07:05'::timestamptz, '2025-10-06 08:35'::timestamptz,  88,  NULL),
    (cl_r_qtly,     m_r1, 'completed', 1, '2025-10-27 08:00'::timestamptz, '2025-10-27 08:10'::timestamptz, '2025-10-27 16:40'::timestamptz,  510, 'PM trimestral Q3 2025. Reemplazo rodillo entintador #2. $830.'),
    (cl_r_qtly,     m_r2, 'completed', 1, '2025-10-27 12:00'::timestamptz, '2025-10-27 12:10'::timestamptz, '2025-10-27 20:10'::timestamptz,  480, 'PM trimestral Q3 2025 Ryobi #2. Todo OK. $320.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2025-11-03 07:00'::timestamptz, '2025-11-03 07:05'::timestamptz, '2025-11-03 08:35'::timestamptz,  90,  'Jorge cubre a Carlos (licencia).'),
    (cl_g_qtly,     m_g1, 'completed', 2, '2025-11-03 11:00'::timestamptz, '2025-11-03 11:05'::timestamptz, '2025-11-03 13:35'::timestamptz,  148, 'PM trimestral Guillotina #1 Q3 2025. $45.'),
    (cl_r_monthly,  m_r1, 'completed', 2, '2025-12-01 07:00'::timestamptz, '2025-12-01 07:05'::timestamptz, '2025-12-01 11:05'::timestamptz,  240, 'Dic tranquilo. Limpieza profunda. Cojinetes normales.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2026-01-05 07:00'::timestamptz, '2026-01-05 07:05'::timestamptz, '2026-01-05 08:35'::timestamptz,  90,  NULL),
    (cl_dc_monthly, m_dc, 'completed', 2, '2026-01-05 09:00'::timestamptz, '2026-01-05 09:05'::timestamptz, '2026-01-05 12:05'::timestamptz,  175, 'Rutina enero. Todo OK.'),
    (cl_r_qtly,     m_r1, 'completed', 1, '2026-01-26 08:00'::timestamptz, '2026-01-26 08:10'::timestamptz, '2026-01-26 16:40'::timestamptz,  510, 'PM trimestral Q4 2025. Desgaste ALTO cojinete principal derecho. Alerta registrada. $420.'),
    (cl_r_qtly,     m_r2, 'completed', 1, '2026-01-26 12:00'::timestamptz, '2026-01-26 12:10'::timestamptz, '2026-01-26 20:10'::timestamptz,  480, 'PM trimestral Q4 2025 Ryobi #2. Cojinetes OK. $320.'),
    (cl_r_monthly,  m_r1, 'completed', 2, '2026-02-02 07:00'::timestamptz, '2026-02-02 07:05'::timestamptz, '2026-02-02 11:05'::timestamptz,  240, 'Cojinete principal monitorizado. Desgaste avanzando.'),
    (cl_r_monthly,  m_r2, 'completed', 2, '2026-02-02 09:30'::timestamptz, '2026-02-02 09:35'::timestamptz, '2026-02-02 13:35'::timestamptz,  240, 'Rodillo entintador #3 rayaduras superficiales.'),
    (cl_g_qtly,     m_g1, 'completed', 2, '2026-02-02 11:00'::timestamptz, '2026-02-02 11:05'::timestamptz, '2026-02-02 13:35'::timestamptz,  150, 'PM trimestral Guillotina #1 Q4 2025. $45.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2026-03-02 07:00'::timestamptz, '2026-03-02 07:05'::timestamptz, '2026-03-02 08:35'::timestamptz,  90,  'Ruido leve cojinete principal. Informado a supervisor.'),
    (cl_r_qtly,     m_r1, 'completed', 1, '2026-03-11 09:30'::timestamptz, '2026-03-11 09:35'::timestamptz, '2026-03-13 14:00'::timestamptz,  3150,'CORRECTIVO CRITICO: falla cojinete principal derecho. 52.5h fuera de servicio. Cojinete principal + secundario + mantilla. $2.497.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2026-04-06 07:00'::timestamptz, '2026-04-06 07:05'::timestamptz, '2026-04-06 08:35'::timestamptz,  88,  'Post-reparacion. Todo OK.'),
    (cl_r_weekly,   m_r1, 'completed', 2, '2026-04-13 07:00'::timestamptz, '2026-04-13 07:05'::timestamptz, '2026-04-13 08:35'::timestamptz,  90,  NULL),
    (cl_r_monthly,  m_r1, 'completed', 2, '2026-04-06 08:30'::timestamptz, '2026-04-06 08:35'::timestamptz, '2026-04-06 12:35'::timestamptz,  238, 'PM mensual abril. Post-reparacion. Todo normal.');

  -- WORK ORDERS - PENDING / OVERDUE (alertas page)
  INSERT INTO public.maintenance_work_orders
    (checklist_id, machine_id, status, priority, scheduled_date, notes)
  VALUES
    (cl_r_qtly,     m_r1, 'pending', 1, '2026-04-27 08:00'::timestamptz, 'PM trimestral Q1 2026 VENCIDO. Coordinar tecnico externo Impresiones S.A.'),
    (cl_r_qtly,     m_r2, 'pending', 1, '2026-04-27 12:00'::timestamptz, 'PM trimestral Q1 2026 Ryobi #2 vencido.'),
    (cl_g_qtly,     m_g2, 'pending', 2, '2026-02-02 11:00'::timestamptz, 'Inspeccion trimestral Guillotina #2 vencida.'),
    (cl_g_qtly,     m_g3, 'pending', 2, '2026-02-02 11:00'::timestamptz, 'Inspeccion trimestral Guillotina #3 vencida.'),
    (cl_dc_monthly, m_dc, 'pending', 2, '2026-06-02 09:00'::timestamptz, 'PM mensual troqueladora junio proximo.'),
    (cl_r_weekly,   m_r1, 'pending', 2, '2026-06-01 07:00'::timestamptz, NULL),
    (cl_r_weekly,   m_r2, 'pending', 2, '2026-06-01 07:00'::timestamptz, NULL);

  -- MAINTENANCE PROGRAMS (programa builder)
  INSERT INTO public.maintenance_programs
    (name, machine_model, machine_id, description, source_language, is_active)
  VALUES
    ('Manual Ryobi Offset 524GS', 'Ryobi Offset 524GS', m_r1,
     'Programa de mantenimiento preventivo basado en manual tecnico Ryobi 524GS.',
     'es', true),
    ('Manual Guillotinas Industrial', 'Guillotina industrial', m_g1,
     'Programa de mantenimiento para guillotinas de corte industrial.',
     'es', true);

  SELECT id INTO prog_ryobi  FROM public.maintenance_programs WHERE machine_id = m_r1 LIMIT 1;
  SELECT id INTO prog_guillo FROM public.maintenance_programs WHERE machine_id = m_g1 LIMIT 1;

  -- Program tasks - Ryobi
  INSERT INTO public.program_tasks
    (program_id, task_number, section, subsection, description, frequency, action_type, estimated_minutes, sort_order, is_active)
  VALUES
    (prog_ryobi,  1, 'Tinteros',    'Inspeccion',        'Verificar nivel y estado de tintas CMYK',            'daily',     'inspect',    5,   10, true),
    (prog_ryobi,  2, 'General',     'Limpieza',          'Limpiar exterior de la maquina y bandejas',          'daily',     'clean',      10,  20, true),
    (prog_ryobi,  3, 'Tinteros',    'Limpieza',          'Limpieza completa tinteros CMYK',                    'weekly',    'clean',      20,  30, true),
    (prog_ryobi,  4, 'Mantilla',    'Revision',          'Revision y ajuste de mantillas',                     'weekly',    'inspect',    15,  40, true),
    (prog_ryobi,  5, 'Registro',    'Calibracion',       'Ajuste de registro 0.1mm',                           'weekly',    'adjust',     10,  50, true),
    (prog_ryobi,  6, 'Lubricacion', 'Puntos clave',      'Lubricacion de puntos de friccion principales',      'weekly',    'lubricate',  15,  60, true),
    (prog_ryobi,  7, 'Fuente',      'Quimica',           'Verificar pH fuente objetivo 4.8-5.2',               'weekly',    'check',      10,  70, true),
    (prog_ryobi,  8, 'Rodillos',    'Revision',          'Inspeccion rodillos entintadores desgaste',          'monthly',   'inspect',    30,  80, true),
    (prog_ryobi,  9, 'Mantilla',    'Tension',           'Medir y ajustar tension de mantilla',                'monthly',   'adjust',     20,  90, true),
    (prog_ryobi, 10, 'Electrico',   'Limpieza',          'Limpieza tablero electrico',                         'monthly',   'clean',      25, 100, true),
    (prog_ryobi, 11, 'Optico',      'Calibracion',       'Calibracion densitometro',                           'monthly',   'adjust',     30, 110, true),
    (prog_ryobi, 12, 'Tintas',      'Limpieza profunda', 'Limpieza profunda sistema de tintas',                'monthly',   'clean',      40, 120, true),
    (prog_ryobi, 13, 'Cojinetes',   'Inspeccion',        'Inspeccion y medicion de desgaste de cojinetes',     'quarterly', 'inspect',    60, 130, true),
    (prog_ryobi, 14, 'Correas',     'Ajuste',            'Inspeccion y ajuste de correas de transmision',      'quarterly', 'adjust',     30, 140, true),
    (prog_ryobi, 15, 'Electrico',   'Verificacion',      'Verificacion electrica por tecnico externo',         'quarterly', 'check',      90, 150, true),
    (prog_ryobi, 16, 'General',     'Limpieza profunda', 'Limpieza profunda completa todas las zonas',         'quarterly', 'clean',      60, 160, true);

  -- Program tasks - Guillotina
  INSERT INTO public.program_tasks
    (program_id, task_number, section, subsection, description, frequency, action_type, estimated_minutes, sort_order, is_active)
  VALUES
    (prog_guillo, 1, 'Seguridad',   'Inspeccion',        'Verificar guarda de seguridad y sensores',           'weekly',    'inspect',    10,  10, true),
    (prog_guillo, 2, 'Cuchilla',    'Inspeccion',        'Inspeccion visual cuchilla filo y grietas',           'weekly',    'inspect',    10,  20, true),
    (prog_guillo, 3, 'Lubricacion', 'General',           'Lubricacion de guias y sistema de corte',            'monthly',   'lubricate',  20,  30, true),
    (prog_guillo, 4, 'Cuchilla',    'Reemplazo',         'Afilado o reemplazo de cuchilla segun desgaste',     'quarterly', 'replace',    45,  40, true),
    (prog_guillo, 5, 'Calibracion', 'Guia',              'Calibracion guia de papel y topes',                  'quarterly', 'adjust',     25,  50, true);

END $$;

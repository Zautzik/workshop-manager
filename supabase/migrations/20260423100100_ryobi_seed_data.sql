-- =====================================================
-- Ryobi 524GS Maintenance Programs — Seed Data
-- =====================================================
-- Sources:
--   PDF 1 → German operator manual (technical maintenance matrix)
--   PDF 2 → Japanese operator manual (weekly log, tasks 5-33)
--
-- Run after: 20260423100000_maintenance_programs.sql
-- =====================================================

DO $$
DECLARE
  v_de  UUID;  -- German program id
  v_ja  UUID;  -- Japanese program id
BEGIN

  -- ===================================================
  -- Insert program records
  -- ===================================================
  INSERT INTO public.maintenance_programs
    (name, machine_model, description, source_language, manual_source)
  VALUES
    (
      'Ryobi 524GS — Programa Técnico (Manual Alemán)',
      'Ryobi 524GS',
      'Programa de mantenimiento preventivo basado en la matriz técnica del manual alemán Ryobi 524GS. Cubre lubricación, limpieza, verificaciones y reemplazos por sección de máquina.',
      'de',
      'Ryobi 524GS German Operator Manual'
    )
  RETURNING id INTO v_de;

  INSERT INTO public.maintenance_programs
    (name, machine_model, description, source_language, manual_source)
  VALUES
    (
      'Ryobi 524GS — Registro Semanal (Manual Japonés)',
      'Ryobi 524GS',
      'Registro semanal de operador basado en el manual japonés Ryobi 524GS. Tareas numeradas 5–33 agrupadas por frecuencia: semanal, quincenal, mensual, trimestral, semestral y anual.',
      'ja',
      'Ryobi 524GS Japanese Operator Manual'
    )
  RETURNING id INTO v_ja;

  -- ===================================================
  -- JAPANESE MANUAL — Tasks 5-33  (PDF 2)
  -- ===================================================

  -- ---- SEMANAL (Weekly) — Tasks 5-20 ---------------
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 5,  'Semanal', 'Limpiar el filtro del compresor de aire',                                                                          'weekly', 'clean',     'japanese_manual', 10, 50),
    (v_ja, 6,  'Semanal', 'Limpiar el estanque de agua',                                                                                      'weekly', 'clean',     'japanese_manual', 10, 60),
    (v_ja, 7,  'Semanal', 'Limpiar la superficie de sensores del paso del papel',                                                             'weekly', 'clean',     'japanese_manual',  5, 70),
    (v_ja, 8,  'Semanal', 'Limpiar el rodillo alimentador principal y la rueda de entrada',                                                   'weekly', 'clean',     'japanese_manual', 10, 80),
    (v_ja, 9,  'Semanal', 'Limpiar los chupadores de goma',                                                                                   'weekly', 'clean',     'japanese_manual', 10, 90),
    (v_ja, 10, 'Semanal', 'Limpiar las pinzas y la base del segundo barril de distribución',                                                  'weekly', 'clean',     'japanese_manual', 10, 100),
    (v_ja, 11, 'Semanal', 'Limpiar el filtro de aire de la polvera',                                                                          'weekly', 'clean',     'japanese_manual',  5, 110),
    (v_ja, 12, 'Semanal', 'Limpiar dentro del estanque del dispositivo de enfriamiento/circulación',                                          'weekly', 'clean',     'japanese_manual', 10, 120),
    (v_ja, 13, 'Semanal', 'Limpiar las pinzas y su base en el cilindro de impresión, barril de transferencia y primer barril de distribución', 'weekly', 'clean',     'japanese_manual', 15, 130),
    (v_ja, 14, 'Semanal', 'Limpiar las pinzas y la base del agarrador del segundo barril de distribución',                                    'weekly', 'clean',     'japanese_manual', 10, 140),
    (v_ja, 15, 'Semanal', 'Limpiar la fuente de tinta',                                                                                       'weekly', 'clean',     'japanese_manual', 15, 150),
    (v_ja, 16, 'Semanal', 'Lubricar la fuente de tinta con grasa',                                                                            'weekly', 'lubricate', 'japanese_manual',  5, 160),
    (v_ja, 17, 'Semanal', 'Preparar el adjunto de limpieza, solución de limpieza y el agua',                                                  'weekly', 'other',     'japanese_manual', 10, 170),
    (v_ja, 18, 'Semanal', 'Repletar el Radiador',                                                                                             'weekly', 'fill',      'japanese_manual',  5, 180),
    (v_ja, 19, 'Semanal', 'Engrasado general',                                                                                                'weekly', 'lubricate', 'japanese_manual', 15, 190),
    (v_ja, 20, 'Semanal', 'Limpiar el cilindro de plantilla',                                                                                 'weekly', 'clean',     'japanese_manual', 10, 200);

  -- ---- CADA 2 SEMANAS (Biweekly) — Tasks 21-23 -----
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 21, 'Cada 2 semanas', 'Revisión y ajuste del ducto de presión de tinta',     'biweekly', 'adjust', 'japanese_manual', 15, 210),
    (v_ja, 22, 'Cada 2 semanas', 'Revisión y ajuste de presión del rodillo de agua',    'biweekly', 'adjust', 'japanese_manual', 15, 220),
    (v_ja, 23, 'Cada 2 semanas', 'Revisión la presión de las placas y de impresión',    'biweekly', 'check',  'japanese_manual', 15, 230);

  -- ---- CADA MES (Monthly) — Tasks 24-27 ------------
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 24, 'Cada mes', 'Limpiar el filtro del alimentador de la manguera de aire',  'monthly', 'clean', 'japanese_manual', 10, 240),
    (v_ja, 25, 'Cada mes', 'Limpiar el electrodo eliminador de estática',               'monthly', 'clean', 'japanese_manual', 10, 250),
    (v_ja, 26, 'Cada mes', 'Limpiar el disco de control del alimentador de aire',       'monthly', 'clean', 'japanese_manual', 10, 260),
    (v_ja, 27, 'Cada mes', 'Limpiar la unidad condensadora del dispositivo de circulación', 'monthly', 'clean', 'japanese_manual', 15, 270);

  -- ---- CADA 3 MESES (Quarterly) — Tasks 28-30 ------
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 28, 'Cada 3 meses', 'Limpieza profunda con líquido de limpieza',                        'quarterly', 'clean',  'japanese_manual', 60, 280),
    (v_ja, 29, 'Cada 3 meses', 'Revisar la presión de los rodillos',                               'quarterly', 'check',  'japanese_manual', 30, 290),
    (v_ja, 30, 'Cada 3 meses', 'Revisión y ajuste de tinta desde el rodillo de tinta',             'quarterly', 'adjust', 'japanese_manual', 30, 300);

  -- ---- CADA 6 MESES (Semiannual) — Tasks 31-32 -----
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 31, 'Cada 6 meses', 'Revisión de la bomba de vacío',  'semiannual', 'inspect', 'japanese_manual', 45, 310),
    (v_ja, 32, 'Cada 6 meses', 'Servicio técnico',               'semiannual', 'service', 'japanese_manual', 180, 320);

  -- ---- ANUAL (Annual) — Task 33 --------------------
  INSERT INTO public.program_tasks
    (program_id, task_number, section, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_ja, 33, 'Anual', 'Limpiar el manómetro de la bomba de compresión', 'annual', 'clean', 'japanese_manual', 30, 330);

  -- ===================================================
  -- GERMAN MANUAL — Technical Matrix  (PDF 1)
  -- ===================================================

  -- ---- LUBRICACION CENTRAL -------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Lubricacion central', 'Lubricacion por aceite', 'Control de nivel de llenado de aceite',                              'daily',   'fill',      'german_manual',  5,  10),
    (v_de, 'Lubricacion central', 'Lubricacion con grasa',  'Cárter de engranaje — unte con pincel',                              'monthly', 'lubricate', 'german_manual',  10, 20);

  -- ---- GENERADOR DE AIRE ---------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Generador de aire', 'Bombas',                   'Compresor de canal lateral — Compruebe',         'weekly',     'check',   'german_manual', 10, 30),
    (v_de, 'Generador de aire', 'Cambio de filtros',        'Compresor — Cambio de filtros',                  'semiannual', 'replace', 'german_manual', 15, 40),
    (v_de, 'Generador de aire', 'Lubricacion cadenas',      'Lubricación cadenas de salida',                  'monthly',    'lubricate','german_manual', 10, 50);

  -- ---- EQUIPOS DE OTROS PROVEEDORES ----------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Equipos de otros proveedores', 'Motor principal',  'Motor de accionamiento principal — Lubrique con bomba engrasadora', 'monthly',    'lubricate', 'german_manual', 10, 60),
    (v_de, 'Equipos de otros proveedores', 'Motores de pilas', 'Motores de las pilas — Lubrique con bomba engrasadora',             'monthly',    'lubricate', 'german_manual', 10, 70),
    (v_de, 'Equipos de otros proveedores', 'Refrigerador',     'Refrigerador de humectante — Lubrique con prensa de aceite',        'semiannual', 'lubricate', 'german_manual', 15, 80),
    (v_de, 'Equipos de otros proveedores', 'Pulverizador',     'Pulverizador antimaculador — Lubrique con prensa de aceite',        'semiannual', 'lubricate', 'german_manual', 15, 90);

  -- ---- ALIMENTADOR ---------------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Alimentador', 'General',              'Alimentador en general — Consultar indicaciones del fabricante',  'monthly',   'inspect',   'german_manual', 15, 100),
    (v_de, 'Alimentador', 'Rodillo de mando',     'Rodillo de mando — Lubricación',                                  'weekly',    'lubricate', 'german_manual',  5, 110),
    (v_de, 'Alimentador', 'Cabezal aspirador',    'Cabezal aspirador — Lubricación',                                 'biweekly',  'lubricate', 'german_manual',  5, 120),
    (v_de, 'Alimentador', 'Sopladores laterales', 'Sopladores laterales — Lubricación',                              'monthly',   'lubricate', 'german_manual',  5, 130),
    (v_de, 'Alimentador', 'Montapilas',           'Montapilas — Lubricación',                                        'monthly',   'lubricate', 'german_manual',  5, 135),
    (v_de, 'Alimentador', 'Detector de pliegos',  'Detector de pliegos dobles — Lubricación',                        'biweekly',  'lubricate', 'german_manual',  5, 140),
    (v_de, 'Alimentador', 'Cintas aspiradoras',   'Cintas aspiradoras — Lubricación',                                'monthly',   'lubricate', 'german_manual', 10, 150),
    (v_de, 'Alimentador', 'Cadenas',              'Cadenas de accionamiento — Lubricación',                          'weekly',    'lubricate', 'german_manual', 10, 160);

  -- ---- MARCADOR ------------------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Marcador', 'General',       'Marcador en general — Lubricación',          'weekly',   'lubricate', 'german_manual', 10, 170),
    (v_de, 'Marcador', 'Leva guías',    'Leva de guías delanteras — Lubricación',     'biweekly', 'lubricate', 'german_manual',  5, 180),
    (v_de, 'Marcador', 'Leva blancín',  'Leva de blancín — Lubricación',              'monthly',  'lubricate', 'german_manual',  5, 190),
    (v_de, 'Marcador', 'Leva tambor',   'Leva de tambor de marcador — Lubricación',   'biweekly', 'lubricate', 'german_manual',  5, 200);

  -- ---- GRUPOS IMPRESORES ---------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Grupos impresores', 'Armario distribución',  'Armario distribución — Revisión',                   'biweekly', 'inspect',   'german_manual', 10, 210),
    (v_de, 'Grupos impresores', 'Cilindro impresor',     'Cilindro impresor/Levas — Lubricación',              'weekly',   'lubricate', 'german_manual', 10, 220),
    (v_de, 'Grupos impresores', 'Tambor transferencia',  'Tambor de transferencia — Lubricación',              'weekly',   'lubricate', 'german_manual', 10, 230),
    (v_de, 'Grupos impresores', 'Tambor colector',       'Tambor colector — Lubricación',                      'weekly',   'lubricate', 'german_manual', 10, 240),
    (v_de, 'Grupos impresores', 'Tambor intermediario',  'Tambor intermediario — Lubricación',                 'weekly',   'lubricate', 'german_manual', 10, 245),
    (v_de, 'Grupos impresores', 'Tambor volteador',      'Tambor volteador — Lubricación',                     'weekly',   'lubricate', 'german_manual', 10, 247),
    (v_de, 'Grupos impresores', 'Segmentos dentados',    'Segmentos dentados — Lubricación',                   'weekly',   'lubricate', 'german_manual', 10, 250),
    (v_de, 'Grupos impresores', 'Cadenas portapinzas',   'Cadenas eje portapinzas — Lubricación',              'weekly',   'lubricate', 'german_manual', 10, 260);

  -- ---- GRUPOS ENTINTADORES ------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Grupos entintadores', 'Tinteros/rodillos',   'Tinteros y rodillos — Lubricación',                  'weekly',   'lubricate', 'german_manual', 15, 270),
    (v_de, 'Grupos entintadores', 'Anillo exterior',     'Anillo exterior de los rodillos — Lubricación',       'biweekly', 'lubricate', 'german_manual', 10, 280);

  -- ---- GRUPOS MOJADORES ---------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Grupos mojadores', 'Depósitos',           'Cambiar depósitos de agua y humectante',                'biweekly', 'replace',   'german_manual', 20, 290),
    (v_de, 'Grupos mojadores', 'Rodillos mojadores',  'Rodillos mojadores — Lubricación',                      'monthly',  'lubricate', 'german_manual', 10, 300);

  -- ---- DISPOSITIVO DE LAVADO ----------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Dispositivo de lavado', 'Producto/recipiente',  'Producto de lavado/recipiente de agua — Revisión',  'weekly',   'check',   'german_manual',  5, 310),
    (v_de, 'Dispositivo de lavado', 'ABD/AID',              'ABD/AID — Revisión y lubricación',                  'biweekly', 'inspect', 'german_manual', 10, 320),
    (v_de, 'Dispositivo de lavado', 'Dispositivo rociador', 'Dispositivo rociador — Revisión',                   'monthly',  'inspect', 'german_manual', 10, 330);

  -- ---- SALIDA -------------------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Salida', 'Rodillo aspirador',      'Rodillo aspirador — Lubricación',                             'weekly',   'lubricate', 'german_manual',  5, 340),
    (v_de, 'Salida', 'Carriles/cadenas',       'Carriles/cadenas — Lubricación',                              'weekly',   'lubricate', 'german_manual', 10, 350),
    (v_de, 'Salida', 'Husillo',                'Husillo — Lubricación',                                       'biweekly', 'lubricate', 'german_manual',  5, 360),
    (v_de, 'Salida', 'Rectificadores',         'Rectificadores laterales — Lubricación',                      'monthly',  'lubricate', 'german_manual', 10, 370),
    (v_de, 'Salida', 'Motor elevación pila',   'Motor de elevación de la pila — Lubrique con bomba',          'monthly',  'lubricate', 'german_manual', 10, 380),
    (v_de, 'Salida', 'Leva apertura pinzas',   'Leva de apertura de las pinzas — Lubricación',                'biweekly', 'lubricate', 'german_manual',  5, 390),
    (v_de, 'Salida', 'Cables portadores',      'Cables portadores — Lubricación',                             'monthly',  'lubricate', 'german_manual', 10, 400);

  -- ---- BOQUILLAS DE ENGRASE (Sensores/Precision) --
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Boquillas de engrase', 'Marcador — tambor',          'Tambor del marcador, cojinete del eje portapinzas — Engrase',      'monthly', 'lubricate', 'german_manual', 10, 410),
    (v_de, 'Boquillas de engrase', 'Grupos impresores — general','Cilindro impresor/Levas, tambores, cojinetes — Engrase completo',  'monthly', 'lubricate', 'german_manual', 20, 420);

  -- ---- SENSORES -----------------------------------
  INSERT INTO public.program_tasks
    (program_id, section, subsection, description, frequency, action_type, source, estimated_minutes, sort_order)
  VALUES
    (v_de, 'Sensores', 'Alimentador',  'Mando de pila, sensor del canto trasero, enderezado Lado B, velocidad de amontonado', 'weekly', 'check', 'german_manual', 10, 430),
    (v_de, 'Sensores', 'Marcador',     'Exploración previa, detector del canto lateral, detector del canto delantero, control de pliegos dobles, control de pliego ausente', 'weekly', 'check', 'german_manual', 10, 440),
    (v_de, 'Sensores', 'Salida',       'Mando de pila — verificación',                                                       'weekly', 'check', 'german_manual',  5, 450);

END $$;

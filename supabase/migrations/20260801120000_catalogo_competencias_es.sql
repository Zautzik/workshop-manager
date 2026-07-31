-- El catálogo de competencias, en español y con el grano que el taller necesita.
--
-- Tres problemas, en orden de gravedad:
--
-- 1. GRANO. `BINDING_ASSEMBLY` era UNA competencia para CUATRO máquinas
--    distintas: dobladora, alzadora, corchetera y hotmelera. Con eso, el motor
--    de cobertura afirma que quien está certificado en la corchetera puede
--    correr la hotmelera — que tiene una olla de cola a temperatura. Es una
--    afirmación falsa con riesgo de quemadura detrás.
--
-- 2. NIVELES SIN CONTENIDO. Los cinco niveles decían lo mismo en las 30
--    competencias: "Consistently performs tasks correctly". Un nivel 3 que no
--    describe qué sabe hacer la persona no sirve para evaluar a nadie.
--
-- 3. IDIOMA. Catálogo en inglés en una app en español que lee el operario.
--
-- Los `code` NO cambian: son la referencia estable desde
-- machine-competency-templates.ts y desde `machine_skill_requirements`.
-- Cambian los nombres, las descripciones y los niveles.

-- ── 1. Traducir el catálogo existente ───────────────────────────────────────
UPDATE public.skills SET name = v.name, description = v.description, category = v.category
FROM (VALUES
  ('SAFETY_AWARENESS',       'Seguridad en planta',              'Principios de seguridad, identificación de riesgos y uso de protecciones', 'Base'),
  ('MACHINERY_BASICS',       'Fundamentos de maquinaria',        'Cómo funciona una máquina de imprenta: transmisión, mandos, puntos de riesgo', 'Base'),
  ('MEASUREMENT_READING',    'Medición y lectura de plano',      'Leer medidas, especificaciones y planos de montaje; usar pie de metro y escuadra', 'Base'),
  ('HAND_TOOLS',             'Herramientas manuales',            'Uso correcto de herramientas de mano y de ajuste', 'Base'),
  ('QUALITY_CONTROL',        'Control de calidad',               'Estándares de calidad, inspección y criterios de aceptación o rechazo', 'Base'),

  ('OFFSET_PRESS_BASIC',     'Offset — operación básica',        'Encendido, apagado, mandos, alimentación y registro básico en prensa offset', 'Impresión offset'),
  ('OFFSET_PRESS_ADVANCED',  'Offset — operación avanzada',      'Prensa multicolor: registro fino, curvas de entintado, resolución de problemas en marcha', 'Impresión offset'),
  ('PRE_PRESS_SETUP',        'Preprensa y planchas',             'Preparación de planchas CTP, tintas y papel; separación de color y prueba', 'Impresión offset'),
  ('COLOR_MANAGEMENT',       'Gestión de color',                 'Teoría de color aplicada, perfiles y calce de Pantone', 'Especializado'),

  ('GUILLOTINE_BASIC',       'Guillotina — operación básica',    'Corte recto, escuadra y procedimientos de seguridad en guillotina', 'Corte y encuadernación'),
  ('GUILLOTINE_ADVANCED',    'Guillotina — corte de precisión',  'Programas de corte, refile de trabajos delicados, cambio y calce de cuchilla', 'Corte y encuadernación'),
  ('DIE_CUTTING',            'Troquelado',                       'Montaje de troquel, calce de contramatriz, hendido y expulsión', 'Corte y encuadernación'),
  ('BINDING_ASSEMBLY',       'Encuadernación y armado',          'Familia de terminación: plegado, alzado, corcheteado y encuadernación en caliente', 'Corte y encuadernación'),

  ('LAMINATION',             'Polilaminado',                     'Laminadora: temperatura, tensión de bobina y presión de rodillo', 'Terminación'),
  ('EMBOSSING',              'Relieve y bajorrelieve',           'Montaje de matriz y regulación de presión para relieve', 'Terminación'),
  ('FINISHING_QUALITY',      'Calidad de terminación',           'Inspección del producto terminado: calce, corte, pegado y aspecto', 'Terminación'),

  ('WORKFLOW_PLANNING',      'Planificación de flujo',           'Secuenciar trabajos y ordenar el flujo de material por el taller', 'Operaciones'),
  ('MATERIAL_HANDLING',      'Manejo de materiales',             'Traslado, apilado y almacenamiento de papel y producto sin dañarlo', 'Operaciones'),
  ('PRODUCTION_SCHEDULING',  'Programación de producción',       'Manejo del programa, compromisos de fecha y seguimiento de OT', 'Operaciones'),
  ('EQUIPMENT_MAINTENANCE',  'Mantenimiento de primer nivel',    'Limpieza, lubricación y diagnóstico básico que hace el propio operario', 'Operaciones'),
  ('MANUAL_WORKSHOP',        'Trabajo manual de taller',         'Armado a mano, pegado, embalaje y trabajos de terminación manual', 'Operaciones'),
  ('WAREHOUSE_OPS',          'Bodega y despacho',                'Recepción, lotes, ubicación de inventario y preparación de despacho', 'Operaciones'),

  ('TEAM_LEADERSHIP',        'Liderazgo de equipo',              'Conducir un equipo de producción: delegar, acompañar y evaluar', 'Supervisión'),
  ('SHIFT_MANAGEMENT',       'Jefatura de turno',                'Coordinar el turno, resolver imprevistos y dejar el relevo ordenado', 'Supervisión'),
  ('QUALITY_ASSURANCE',      'Aseguramiento de calidad',         'Sistema de calidad, no conformidades y acciones correctivas', 'Supervisión'),
  ('COST_CONTROL',           'Control de costo y merma',         'Seguimiento de costo real, merma y eficiencia por trabajo', 'Supervisión'),

  ('DIGITAL_FILE_PREP',      'Preparación de archivo digital',   'Revisión y ajuste de archivos para impresión: sangrías, perfiles, formatos', 'Especializado'),
  ('LARGE_FORMAT_PRINTING',  'Gran formato',                     'Operación de equipos de gran formato y manejo de material sobredimensionado', 'Especializado'),
  ('VARIABLE_DATA_PRINTING', 'Dato variable',                    'Impresión con dato variable y personalización', 'Especializado'),
  ('DESIGN_CONSULTATION',    'Asesoría de diseño',               'Aconsejar al cliente sobre diseño, material y factibilidad de producción', 'Especializado')
) AS v(code, name, description, category)
WHERE public.skills.code = v.code;

-- ── 2. Las cuatro máquinas de terminación, cada una con su competencia ──────
-- Cuelgan de BINDING_ASSEMBLY con parent_skill_id: el paraguas sigue sirviendo
-- para hablar de "la familia de terminación", pero habilitar a alguien pasa a
-- ser por máquina, que es como funciona el taller de verdad.
INSERT INTO public.skills (code, name, description, category, skill_tree_type, parent_skill_id, display_order, is_certification_required, certification_validity_months)
SELECT v.code, v.name, v.description, 'Corte y encuadernación', 'technical',
       (SELECT id FROM public.skills WHERE code = 'BINDING_ASSEMBLY'),
       v.orden, v.cert, v.meses
FROM (VALUES
  ('PLEGADO',        'Dobladora',      'Regulación de bolsas y cuchillas, escuadra de plegado y presión de rodillos', 210, false, NULL::int),
  ('ALZADO',         'Alzadora',       'Carga de torres, regulación de ventosas y control de doble pliego',           220, false, NULL::int),
  ('CORCHETEADO',    'Corchetera',     'Cabezales, alimentación de alambre, calce de yunque y control del corchete',  230, false, NULL::int),
  ('HOTMELT',        'Hotmelera',      'Olla de cola a temperatura, fresado de lomo, mordazas y calce de tapa',       240, true,  12)
) AS v(code, name, description, orden, cert, meses)
WHERE NOT EXISTS (SELECT 1 FROM public.skills s WHERE s.code = v.code);

-- ── 3. Mantenimiento por sistema, en espejo con machine_systems ─────────────
-- El módulo de Equipos ya organiza cada máquina por sistema (hidráulico,
-- neumático, eléctrico…). La competencia del mecánico tiene que hablar el mismo
-- idioma: así una orden de trabajo sobre el sistema hidráulico puede exigir a
-- alguien habilitado en hidráulica, en vez de "alguien de mantenimiento".
INSERT INTO public.skills (code, name, description, category, skill_tree_type, display_order, is_certification_required, certification_validity_months)
SELECT v.code, v.name, v.description, 'Mantenimiento', 'technical', v.orden, v.cert, v.meses
FROM (VALUES
  ('MANT_MECANICO',   'Mecánica de máquina',   'Transmisión, rodamientos, correas, alineación y ajuste mecánico',        310, false, NULL::int),
  ('MANT_HIDRAULICO', 'Sistema hidráulico',    'Bombas, mangueras de alta presión, cilindros, sellos y aceite',          320, true,  24),
  ('MANT_NEUMATICO',  'Aire comprimido',       'Compresor, filtros reguladores, líneas, ventosas y fugas',               330, false, NULL::int),
  ('MANT_ELECTRICO',  'Sistema eléctrico',     'Tablero, motores, contactores, sensores y diagnóstico eléctrico',        340, true,  24),
  ('MANT_TERMICO',    'Sistemas térmicos',     'Resistencias, termocuplas y controladores de temperatura',               350, false, NULL::int)
) AS v(code, name, description, orden, cert, meses)
WHERE NOT EXISTS (SELECT 1 FROM public.skills s WHERE s.code = v.code);

-- ── 4. Una escalera que dice algo ───────────────────────────────────────────
-- Antes los cinco niveles repetían la misma frase genérica en las 30
-- competencias. Esta escalera está en el idioma del taller y describe estados
-- reconocibles: se puede mirar a alguien trabajar y decir en cuál está.
UPDATE public.skill_proficiency_levels SET title = v.title
FROM (VALUES
  (1, 'En formación'),
  (2, 'Acompañado'),
  (3, 'Autónomo'),
  (4, 'Referente'),
  (5, 'Maestro')
) AS v(level, title)
WHERE public.skill_proficiency_levels.level = v.level;

-- Descripción genérica traducida, para las competencias que no tienen una
-- redacción propia. Las de máquina sí la tienen, más abajo.
UPDATE public.skill_proficiency_levels SET description = v.description
FROM (VALUES
  (1, 'Conoce lo básico. Todo lo que hace necesita supervisión.'),
  (2, 'Hace el trabajo de rutina acompañado; todavía no queda solo.'),
  (3, 'Trabaja solo y resuelve las variaciones normales del día.'),
  (4, 'Optimiza, resuelve lo difícil y puede enseñarle a otro.'),
  (5, 'Domina la especialidad; es a quien se recurre cuando nadie más puede.')
) AS v(level, description)
WHERE public.skill_proficiency_levels.level = v.level;

-- Escalera de las competencias nuevas, redactada para cada oficio.
INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT s.id, v.level, v.title, v.description, v.horas, v.certifica
FROM public.skills s
JOIN (VALUES
  ('PLEGADO', 1, 'En formación', 'Carga la mesa y reconoce las partes de la dobladora.',                    0,   false),
  ('PLEGADO', 2, 'Acompañado',   'Corre un plegado simple ya regulado por otro.',                           24,  false),
  ('PLEGADO', 3, 'Autónomo',     'Regula bolsas y cuchillas para un plegado nuevo y corrige la escuadra.',   60,  true),
  ('PLEGADO', 4, 'Referente',    'Resuelve plegados complejos y papeles difíciles; enseña la regulación.',   140, true),
  ('PLEGADO', 5, 'Maestro',      'Cualquier plegado, incluida la puesta a punto tras un cambio de rodillos.',280, true),

  ('ALZADO', 1, 'En formación', 'Carga las torres y reconoce el recorrido del pliego.',                      0,   false),
  ('ALZADO', 2, 'Acompañado',   'Corre un alzado ya regulado y detecta un doble pliego.',                    16,  false),
  ('ALZADO', 3, 'Autónomo',     'Regula ventosas y sensores; deja el alzado corriendo sin fallas.',          40,  true),
  ('ALZADO', 4, 'Referente',    'Ajusta para papeles finos o electrostáticos y enseña la regulación.',       100, true),
  ('ALZADO', 5, 'Maestro',      'Cualquier trabajo; diagnostica fallas intermitentes de succión.',           200, true),

  ('CORCHETEADO', 1, 'En formación', 'Reconoce el cabezal y el recorrido del alambre.',                      0,   false),
  ('CORCHETEADO', 2, 'Acompañado',   'Corre un corcheteado ya regulado y cambia la bobina de alambre.',      16,  false),
  ('CORCHETEADO', 3, 'Autónomo',     'Regula cabezal y yunque; corrige un corchete abierto o corrido.',      48,  true),
  ('CORCHETEADO', 4, 'Referente',    'Resuelve trabajos de lomo grueso y enseña el calce del cabezal.',      120, true),
  ('CORCHETEADO', 5, 'Maestro',      'Cualquier formato; repone y calibra un cabezal completo.',             240, true),

  ('HOTMELT', 1, 'En formación', 'Reconoce la olla, el fresado y el riesgo de quemadura.',                   0,   false),
  ('HOTMELT', 2, 'Acompañado',   'Opera con la máquina ya a temperatura y regulada por otro.',               40,  false),
  ('HOTMELT', 3, 'Autónomo',     'Levanta la máquina de frío, regula fresado y mordazas, controla el pegado.',100, true),
  ('HOTMELT', 4, 'Referente',    'Resuelve lomos difíciles y papeles con couché; enseña la puesta a punto.',  200, true),
  ('HOTMELT', 5, 'Maestro',      'Cualquier encuadernación; diagnostica fallas de temperatura y aplicación.', 400, true),

  ('MANT_MECANICO',   3, 'Autónomo', 'Cambia rodamientos y correas, alinea y deja la máquina en marcha.',    80,  true),
  ('MANT_HIDRAULICO', 3, 'Autónomo', 'Diagnostica pérdida de presión, cambia sellos y mangueras con seguridad.', 80, true),
  ('MANT_NEUMATICO',  3, 'Autónomo', 'Encuentra fugas, mantiene el FRL y repone ventosas y racores.',        40,  true),
  ('MANT_ELECTRICO',  3, 'Autónomo', 'Interviene tablero con seguridad, cambia contactores y diagnostica sensores.', 80, true),
  ('MANT_TERMICO',    3, 'Autónomo', 'Cambia resistencias y termocuplas, calibra el controlador.',           40,  true)
) AS v(code, level, title, description, horas, certifica) ON s.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.skill_proficiency_levels l WHERE l.skill_id = s.id AND l.level = v.level
);

-- Rellenar los niveles que falten en las competencias de mantenimiento, para
-- que la escalera esté completa en las cinco.
INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT s.id, v.level, v.title, v.description, v.horas, v.certifica
FROM public.skills s
CROSS JOIN (VALUES
  (1, 'En formación', 'Reconoce el sistema y acompaña la intervención sin intervenir.',  0,   false),
  (2, 'Acompañado',   'Ejecuta tareas rutinarias del sistema con un referente al lado.',  20,  false),
  (4, 'Referente',    'Resuelve fallas complejas del sistema y forma a otros.',           200, true),
  (5, 'Maestro',      'Autoridad del taller en este sistema; define el estándar.',        400, true)
) AS v(level, title, description, horas, certifica)
WHERE s.code IN ('MANT_MECANICO','MANT_HIDRAULICO','MANT_NEUMATICO','MANT_ELECTRICO','MANT_TERMICO')
  AND NOT EXISTS (
    SELECT 1 FROM public.skill_proficiency_levels l WHERE l.skill_id = s.id AND l.level = v.level
  );

-- ── 5. El grafo de prerrequisitos, que estaba casi vacío ────────────────────
-- Sólo había 2 aristas. El grafo es lo que permite DERIVAR una ruta de
-- formación en vez de escribirla a mano para cada máquina: si la hotmelera
-- exige HOTMELT n3, el grafo dice que antes hacen falta seguridad y
-- fundamentos, y en qué orden.
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT s.id, r.id, v.nivel, v.duro, v.motivo
FROM (VALUES
  -- Nadie toca una máquina sin seguridad y fundamentos.
  ('OFFSET_PRESS_BASIC', 'SAFETY_AWARENESS', 2, true,  'Prensa en movimiento: la seguridad es previa a todo lo demás.'),
  ('OFFSET_PRESS_BASIC', 'MACHINERY_BASICS', 2, true,  NULL),
  ('GUILLOTINE_BASIC',   'SAFETY_AWARENESS', 3, true,  'La cuchilla no perdona: se exige un nivel más alto que en el resto.'),
  ('GUILLOTINE_BASIC',   'MACHINERY_BASICS', 2, true,  NULL),
  ('DIE_CUTTING',        'SAFETY_AWARENESS', 2, true,  NULL),
  ('DIE_CUTTING',        'MACHINERY_BASICS', 2, true,  NULL),
  ('PLEGADO',            'SAFETY_AWARENESS', 2, true,  NULL),
  ('PLEGADO',            'MEASUREMENT_READING', 2, true, 'Sin leer una medida no se regula una escuadra.'),
  ('ALZADO',             'SAFETY_AWARENESS', 2, true,  NULL),
  ('CORCHETEADO',        'SAFETY_AWARENESS', 2, true,  NULL),
  ('HOTMELT',            'SAFETY_AWARENESS', 3, true,  'Olla de cola a temperatura: riesgo de quemadura.'),
  ('HOTMELT',            'MACHINERY_BASICS', 2, true,  NULL),
  ('LAMINATION',         'SAFETY_AWARENESS', 2, true,  NULL),
  ('LAMINATION',         'MACHINERY_BASICS', 2, true,  NULL),

  -- Escalones dentro de un mismo oficio.
  ('OFFSET_PRESS_ADVANCED', 'OFFSET_PRESS_BASIC', 3, true, 'No se llega a lo avanzado sin dominar la operación básica.'),
  ('GUILLOTINE_ADVANCED',   'GUILLOTINE_BASIC',   3, true, NULL),
  ('COLOR_MANAGEMENT',      'OFFSET_PRESS_BASIC', 2, false, NULL),
  ('PRE_PRESS_SETUP',       'DIGITAL_FILE_PREP',  2, false, NULL),

  -- Mantenimiento.
  ('MANT_MECANICO',   'MACHINERY_BASICS', 3, true,  NULL),
  ('MANT_MECANICO',   'HAND_TOOLS',       2, true,  NULL),
  ('MANT_HIDRAULICO', 'MANT_MECANICO',    2, true,  'La hidráulica se interviene sobre una base mecánica.'),
  ('MANT_HIDRAULICO', 'SAFETY_AWARENESS', 3, true,  'Alta presión.'),
  ('MANT_NEUMATICO',  'MACHINERY_BASICS', 2, true,  NULL),
  ('MANT_ELECTRICO',  'SAFETY_AWARENESS', 3, true,  'Riesgo eléctrico.'),
  ('MANT_TERMICO',    'MANT_ELECTRICO',   2, true,  'Resistencias y termocuplas son intervención eléctrica.'),
  ('EQUIPMENT_MAINTENANCE', 'MACHINERY_BASICS', 2, true, NULL),

  -- Supervisión.
  ('SHIFT_MANAGEMENT',  'TEAM_LEADERSHIP',      3, true, NULL),
  ('QUALITY_ASSURANCE', 'QUALITY_CONTROL',      3, true, NULL),
  ('COST_CONTROL',      'PRODUCTION_SCHEDULING', 2, false, NULL)
) AS v(skill, req, nivel, duro, motivo)
JOIN public.skills s ON s.code = v.skill
JOIN public.skills r ON r.code = v.req
WHERE NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies d
   WHERE d.skill_id = s.id AND d.required_skill_id = r.id
);

-- Seeding Initial Skills Tech Tree for Workshop
-- Focus on printing/manufacturing/machining operations

-- ============================================================================
-- FOUNDATIONAL SKILLS (These are prerequisites for other skills)
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, display_order, is_active)
VALUES
  ('SAFETY_AWARENESS', 'Safety Awareness', 'Understanding of workplace safety principles and hazard identification', 'Foundational', 'foundational'::public.skill_tree_type, 1, true),
  ('MACHINERY_BASICS', 'Machinery Basics', 'Basic understanding of how printing/manufacturing equipment works', 'Foundational', 'foundational'::public.skill_tree_type, 2, true),
  ('MEASUREMENT_READING', 'Measurement & Reading', 'Reading and interpreting measurements, specifications, and technical drawings', 'Foundational', 'foundational'::public.skill_tree_type, 3, true),
  ('HAND_TOOLS', 'Basic Hand Tools', 'Proper use of basic hand tools and equipment', 'Foundational', 'foundational'::public.skill_tree_type, 4, true),
  ('QUALITY_CONTROL', 'Quality Control Basics', 'Understanding quality standards and inspection procedures', 'Foundational', 'foundational'::public.skill_tree_type, 5, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- OFFSET PRINTING SKILLS (Technical)
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, parent_skill_id, display_order, is_active, is_certification_required, certification_validity_months)
SELECT
  'OFFSET_PRESS_BASIC',
  'Offset Press - Basic Operation',
  'Basic operation of offset printing presses, including startup, shutdown, and basic controls',
  'Offset Printing',
  'technical'::public.skill_tree_type,
  id,
  10,
  true,
  false,
  NULL
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC')
UNION ALL
SELECT
  'OFFSET_PRESS_ADVANCED',
  'Offset Press - Advanced Operation',
  'Advanced offset press operation including calibration, color adjustment, and troubleshooting',
  'Offset Printing',
  'technical'::public.skill_tree_type,
  id,
  11,
  true,
  true,
  12
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'OFFSET_PRESS_ADVANCED')
UNION ALL
SELECT
  'PRE_PRESS_SETUP',
  'Pre-Press Setup',
  'Preparation of plates, inks, and paper for offset printing; color separation and proofing',
  'Offset Printing',
  'technical'::public.skill_tree_type,
  id,
  12,
  true,
  true,
  12
FROM public.skills WHERE code = 'MEASUREMENT_READING'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'PRE_PRESS_SETUP')
UNION ALL
SELECT
  'OFFSET_TRX_CONTROL',
  'TRX Control & Motorization',
  'Understanding and controlling motorized offset press systems',
  'Offset Printing',
  'technical'::public.skill_tree_type,
  id,
  13,
  true,
  false,
  NULL
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'OFFSET_TRX_CONTROL');

-- ============================================================================
-- CUTTING & BINDING SKILLS (Technical)
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, parent_skill_id, display_order, is_active, is_certification_required, certification_validity_months)
SELECT
  'GUILLOTINE_BASIC',
  'Guillotine Cutter - Basic',
  'Basic operation of guillotine cutting machines; safety procedures and straight cuts',
  'Cutting & Binding',
  'technical'::public.skill_tree_type,
  id,
  20,
  true,
  false,
  NULL
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'GUILLOTINE_BASIC')
UNION ALL
SELECT
  'GUILLOTINE_ADVANCED',
  'Guillotine Cutter - Advanced',
  'Advanced guillotine operation, precision cutting, batch processing, and maintenance',
  'Cutting & Binding',
  'technical'::public.skill_tree_type,
  id,
  21,
  true,
  true,
  12
FROM public.skills WHERE code = 'GUILLOTINE_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'GUILLOTINE_ADVANCED')
UNION ALL
SELECT
  'DIE_CUTTING',
  'Die Cutting',
  'Operating die cutting machines for custom shapes; die setup and material handling',
  'Cutting & Binding',
  'technical'::public.skill_tree_type,
  id,
  22,
  true,
  true,
  12
FROM public.skills WHERE code = 'GUILLOTINE_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'DIE_CUTTING')
UNION ALL
SELECT
  'BINDING_ASSEMBLY',
  'Binding & Assembly',
  'Binding, stitching, and assembly of printed materials; collation and sorting',
  'Cutting & Binding',
  'technical'::public.skill_tree_type,
  id,
  23,
  true,
  false,
  NULL
FROM public.skills WHERE code = 'QUALITY_CONTROL'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'BINDING_ASSEMBLY');

-- ============================================================================
-- FINISHING SKILLS (Technical)
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, parent_skill_id, display_order, is_active, is_certification_required, certification_validity_months)
SELECT
  'LAMINATION',
  'Lamination',
  'Operating lamination equipment for protective coating; heat and pressure control',
  'Finishing',
  'technical'::public.skill_tree_type,
  id,
  30,
  true,
  false,
  NULL::integer
FROM public.skills WHERE code = 'MACHINERY_BASICS'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'LAMINATION')
UNION ALL
SELECT
  'EMBOSSING',
  'Embossing & Debossing',
  'Embossing and debossing operations for decorative effects; die setup and operation',
  'Finishing',
  'technical'::public.skill_tree_type,
  id,
  31,
  true,
  false,
  NULL::integer
FROM public.skills WHERE code = 'MACHINERY_BASICS'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'EMBOSSING')
UNION ALL
SELECT
  'FINISHING_QUALITY',
  'Finishing Quality Control',
  'Quality inspection of finished products; color matching and surface inspection',
  'Finishing',
  'technical'::public.skill_tree_type,
  id,
  32,
  true,
  false,
  NULL::integer
FROM public.skills WHERE code = 'QUALITY_CONTROL'
AND NOT EXISTS (SELECT 1 FROM public.skills WHERE code = 'FINISHING_QUALITY');

-- ============================================================================
-- WORKFLOW & OPERATIONAL SKILLS
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, display_order, is_active)
VALUES
  ('WORKFLOW_PLANNING', 'Workflow Planning', 'Planning and sequencing of production tasks; material flow optimization', 'Operations', 'operational'::public.skill_tree_type, 40, true),
  ('MATERIAL_HANDLING', 'Material Handling', 'Safe and efficient handling, storage, and movement of materials and supplies', 'Operations', 'operational'::public.skill_tree_type, 41, true),
  ('PRODUCTION_SCHEDULING', 'Production Scheduling', 'Managing production schedules and meeting deadlines; job tracking', 'Operations', 'operational'::public.skill_tree_type, 42, true),
  ('EQUIPMENT_MAINTENANCE', 'Equipment Maintenance', 'Preventive maintenance and basic troubleshooting of printing equipment', 'Operations', 'operational'::public.skill_tree_type, 43, true),
  ('MANUAL_WORKSHOP', 'Manual Workshop Skills', 'General workshop operations; hand work and basic fabrication', 'Operations', 'operational'::public.skill_tree_type, 44, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SUPERVISORY SKILLS
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, display_order, is_active)
VALUES
  ('TEAM_LEADERSHIP', 'Team Leadership', 'Leading production teams; delegation and performance management', 'Supervisory', 'supervisory'::public.skill_tree_type, 50, true),
  ('SHIFT_MANAGEMENT', 'Shift Management', 'Managing shift operations and team coordination', 'Supervisory', 'supervisory'::public.skill_tree_type, 51, true),
  ('QUALITY_ASSURANCE', 'Quality Assurance Management', 'Overseeing quality processes and compliance standards', 'Supervisory', 'supervisory'::public.skill_tree_type, 52, true),
  ('COST_CONTROL', 'Cost & Waste Control', 'Monitoring production costs, reducing waste, and optimizing efficiency', 'Supervisory', 'supervisory'::public.skill_tree_type, 53, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SPECIALIZED SKILLS
-- ============================================================================
INSERT INTO public.skills (code, name, description, category, skill_tree_type, display_order, is_active)
VALUES
  ('DIGITAL_FILE_PREP', 'Digital File Preparation', 'Preparing digital files for print; file optimization and format conversion', 'Specialized', 'specialized'::public.skill_tree_type, 60, true),
  ('COLOR_MANAGEMENT', 'Color Management', 'Advanced color theory and management; color matching systems', 'Specialized', 'specialized'::public.skill_tree_type, 61, true),
  ('LARGE_FORMAT_PRINTING', 'Large Format Printing', 'Operating large format printing equipment and handling oversized materials', 'Specialized', 'specialized'::public.skill_tree_type, 62, true),
  ('VARIABLE_DATA_PRINTING', 'Variable Data Printing', 'Operating variable data printing systems for personalized production', 'Specialized', 'specialized'::public.skill_tree_type, 63, true),
  ('DESIGN_CONSULTATION', 'Design Consultation', 'Advising customers on design, materials, and production feasibility', 'Specialized', 'specialized'::public.skill_tree_type, 64, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SETUP SKILL DEPENDENCIES (What skills require others as prerequisites)
-- ============================================================================

-- Offset Press Advanced requires Offset Press Basic
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT 
  s.id,
  r.id,
  2,
  true,
  'Must have basic offset press operation knowledge before advanced training'
FROM public.skills s
JOIN public.skills r ON r.code = 'OFFSET_PRESS_BASIC'
WHERE s.code = 'OFFSET_PRESS_ADVANCED'
AND NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies sd
  WHERE sd.skill_id = s.id
  AND sd.required_skill_id = r.id
);

-- Pre-Press Setup requires Measurement & Measurement & Reading
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT 
  s.id,
  r.id,
  2,
  true,
  'Must be able to read and interpret specifications'
FROM public.skills s
JOIN public.skills r ON r.code = 'MEASUREMENT_READING'
WHERE s.code = 'PRE_PRESS_SETUP'
AND NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies sd
  WHERE sd.skill_id = s.id
  AND sd.required_skill_id = r.id
);

-- Guillotine Advanced requires Guillotine Basic
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT 
  s.id,
  r.id,
  2,
  true,
  'Basic guillotine operation must be mastered first'
FROM public.skills s
JOIN public.skills r ON r.code = 'GUILLOTINE_BASIC'
WHERE s.code = 'GUILLOTINE_ADVANCED'
AND NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies sd
  WHERE sd.skill_id = s.id
  AND sd.required_skill_id = r.id
);

-- Die Cutting requires Guillotine Basic knowledge
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT 
  s.id,
  r.id,
  1,
  false,
  'Knowledge of basic cutting procedures is helpful but not strictly required'
FROM public.skills s
JOIN public.skills r ON r.code = 'GUILLOTINE_BASIC'
WHERE s.code = 'DIE_CUTTING'
AND NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies sd
  WHERE sd.skill_id = s.id
  AND sd.required_skill_id = r.id
);

-- Team Leadership requires years of operational experience
INSERT INTO public.skill_dependencies (skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description)
SELECT 
  s.id,
  r.id,
  3,
  true,
  'Must understand workflow planning before managing teams'
FROM public.skills s
JOIN public.skills r ON r.code = 'WORKFLOW_PLANNING'
WHERE s.code = 'TEAM_LEADERSHIP'
AND NOT EXISTS (
  SELECT 1 FROM public.skill_dependencies sd
  WHERE sd.skill_id = s.id
  AND sd.required_skill_id = r.id
);

-- ============================================================================
-- SETUP PROFICIENCY LEVEL DESCRIPTIONS
-- ============================================================================

-- Offset Press Basic proficiency levels
INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  1,
  'Aware',
  'Understands the basics, needs supervision for all tasks',
  0,
  false
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC') AND level = 1);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  2,
  'Competent',
  'Can perform routine tasks with minimal supervision',
  40,
  false
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC') AND level = 2);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  3,
  'Proficient',
  'Consistently performs tasks correctly and efficiently; can handle variations',
  80,
  true
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC') AND level = 3);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  4,
  'Advanced',
  'Can optimize processes and train others; handles complex scenarios',
  160,
  true
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC') AND level = 4);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  5,
  'Expert',
  'Master level; can innovate and handle any scenario independently',
  320,
  true
FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'OFFSET_PRESS_BASIC') AND level = 5);

-- Safety Awareness proficiency levels
INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  1,
  'Minimal',
  'Aware of basic safety requirements',
  0,
  false
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'SAFETY_AWARENESS') AND level = 1);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  2,
  'Trained',
  'Understands and follows safety procedures consistently',
  8,
  true
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'SAFETY_AWARENESS') AND level = 2);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  3,
  'Certified',
  'Demonstrates mastery of safety practices; can identify hazards proactively',
  16,
  true
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'SAFETY_AWARENESS') AND level = 3);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  4,
  'Advanced',
  'Can train others and develop safety improvements',
  24,
  true
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'SAFETY_AWARENESS') AND level = 4);

INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  id,
  5,
  'Expert',
  'Safety specialist; responsible for audit and compliance across teams',
  40,
  true
FROM public.skills WHERE code = 'SAFETY_AWARENESS'
AND NOT EXISTS (SELECT 1 FROM public.skill_proficiency_levels WHERE skill_id = (SELECT id FROM public.skills WHERE code = 'SAFETY_AWARENESS') AND level = 5);

-- ============================================================================
-- Setup default proficiency levels for all new skills
-- ============================================================================
WITH new_skills AS (
  SELECT DISTINCT s.id
  FROM public.skills s
  LEFT JOIN public.skill_proficiency_levels spl ON s.id = spl.skill_id
  WHERE spl.id IS NULL
)
INSERT INTO public.skill_proficiency_levels (skill_id, level, title, description, min_hours_required, can_certify)
SELECT 
  ns.id,
  1,
  'Beginner',
  'Beginning to learn this skill',
  0,
  false
FROM new_skills ns
UNION ALL
SELECT 
  ns.id,
  2,
  'Intermediate',
  'Can perform routine tasks with some supervision',
  40,
  false
FROM new_skills ns
UNION ALL
SELECT 
  ns.id,
  3,
  'Proficient',
  'Consistently performs tasks correctly',
  80,
  true
FROM new_skills ns
UNION ALL
SELECT 
  ns.id,
  4,
  'Advanced',
  'Can optimize and train others',
  160,
  true
FROM new_skills ns
UNION ALL
SELECT 
  ns.id,
  5,
  'Expert',
  'Master level; autonomous and innovative',
  320,
  true
FROM new_skills ns;

-- ============================================================================
-- Create default proficiency descriptions JSON
-- ============================================================================
UPDATE public.skills
SET proficiency_description = JSONB_BUILD_OBJECT(
  '1', JSONB_BUILD_OBJECT('level', 'Beginner', 'color', 'red'),
  '2', JSONB_BUILD_OBJECT('level', 'Intermediate', 'color', 'orange'),
  '3', JSONB_BUILD_OBJECT('level', 'Proficient', 'color', 'yellow'),
  '4', JSONB_BUILD_OBJECT('level', 'Advanced', 'color', 'lightgreen'),
  '5', JSONB_BUILD_OBJECT('level', 'Expert', 'color', 'green')
)
WHERE proficiency_description IS NULL;

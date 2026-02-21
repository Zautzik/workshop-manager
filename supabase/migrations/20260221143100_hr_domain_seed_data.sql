-- HR domain seed data
-- Adds initial skills, incentive rules, and example data for testing

-- -----------------------------------------------------------------------------
-- Skills
-- -----------------------------------------------------------------------------
INSERT INTO public.skills (code, name, description, category, is_active) VALUES
  ('OFFSET_PRESS_BASIC', 'Offset Press Operation - Basic', 'Basic operation of offset printing machines', 'printing', true),
  ('OFFSET_PRESS_ADVANCED', 'Offset Press Operation - Advanced', 'Advanced offset press operation including setup and troubleshooting', 'printing', true),
  ('GUILLOTINE_BASIC', 'Guillotine Operation - Basic', 'Basic cutting operations with guillotine machines', 'cutting', true),
  ('GUILLOTINE_ADVANCED', 'Guillotine Operation - Advanced', 'Precision cutting and complex job setup', 'cutting', true),
  ('DIE_CUTTING', 'Die Cutting Operation', 'Operation of die cutting machines', 'cutting', true),
  ('PRE_PRESS_SETUP', 'Pre-Press Setup', 'Preparation of materials and plates for printing', 'pre_press', true),
  ('COLOR_MANAGEMENT', 'Color Management', 'Color calibration and quality control', 'quality', true),
  ('MANUAL_WORKSHOP', 'Manual Workshop Tasks', 'Assembly, binding, finishing work', 'workshop', true),
  ('QUALITY_INSPECTION', 'Quality Inspection', 'Final quality control and inspection', 'quality', true),
  ('MACHINE_MAINTENANCE', 'Basic Machine Maintenance', 'Routine maintenance and cleaning', 'maintenance', true),
  ('FORKLIFT_CERTIFIED', 'Forklift Operation', 'Certified forklift operation', 'logistics', true),
  ('TEAM_LEADERSHIP', 'Team Leadership', 'Leading small teams and shift coordination', 'management', true)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Incentive rules
-- -----------------------------------------------------------------------------
INSERT INTO public.incentive_rules (
  name,
  description,
  incentive_type,
  amount,
  currency_code,
  is_active,
  effective_from
) VALUES
  (
    'Perfect Attendance Bonus',
    'Monthly bonus for 100% attendance with no late arrivals',
    'attendance_bonus',
    100.00,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Quality Excellence Bonus',
    'Quarterly bonus for maintaining zero defects',
    'performance_bonus',
    250.00,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Overtime Premium - Standard',
    'Standard overtime multiplier at 50%',
    'overtime_bonus',
    0,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Overtime Premium - Holiday',
    'Holiday overtime multiplier at 100%',
    'overtime_bonus',
    0,
    'USD',
    true,
    CURRENT_DATE
  ),
  (
    'Tardiness Penalty',
    'Deduction for excessive lateness',
    'penalty_adjustment',
    -50.00,
    'USD',
    true,
    CURRENT_DATE
  )
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Sample comment for testing
-- -----------------------------------------------------------------------------
-- To backfill employees from existing workers table, run the companion
-- backfill migration after verifying current data integrity.

-- ============================================================================
-- HR DOMAIN SEED DATA - FIXED VERSION
-- ============================================================================
-- Run this in Supabase SQL Editor to populate skills and incentive rules
-- This version has improved error handling and explicit constraints

-- First, ensure the skills table exists and has proper constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'skills' 
      AND constraint_name = 'skills_code_key'
  ) THEN
    ALTER TABLE public.skills ADD CONSTRAINT skills_code_key UNIQUE (code);
  END IF;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

-- Insert skills (with conflict handling per row)
INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('OFFSET_PRESS_BASIC', 'Offset Press Operation - Basic', 'Basic operation of offset printing machines', 'printing', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('OFFSET_PRESS_ADVANCED', 'Offset Press Operation - Advanced', 'Advanced offset press operation including setup and troubleshooting', 'printing', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('GUILLOTINE_BASIC', 'Guillotine Operation - Basic', 'Basic cutting operations with guillotine machines', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('GUILLOTINE_ADVANCED', 'Guillotine Operation - Advanced', 'Precision cutting and complex job setup', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('DIE_CUTTING', 'Die Cutting Operation', 'Operation of die cutting machines', 'cutting', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('PRE_PRESS_SETUP', 'Pre-Press Setup', 'Preparation of materials and plates for printing', 'pre_press', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('COLOR_MANAGEMENT', 'Color Management', 'Color calibration and quality control', 'quality', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('MANUAL_WORKSHOP', 'Manual Workshop Tasks', 'Assembly, binding, finishing work', 'workshop', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('QUALITY_INSPECTION', 'Quality Inspection', 'Final quality control and inspection', 'quality', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('MACHINE_MAINTENANCE', 'Basic Machine Maintenance', 'Routine maintenance and cleaning', 'maintenance', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('FORKLIFT_CERTIFIED', 'Forklift Operation', 'Certified forklift operation', 'logistics', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.skills (code, name, description, category, is_active) 
VALUES ('TEAM_LEADERSHIP', 'Team Leadership', 'Leading small teams and shift coordination', 'management', true)
ON CONFLICT (code) DO NOTHING;

-- Verify skills insertion
SELECT 'Skills inserted: ' || COUNT(*)::TEXT as status FROM public.skills;

-- Now insert incentive rules
INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES (
  'Perfect Attendance Bonus',
  'Monthly bonus for 100% attendance with no late arrivals',
  'attendance_bonus'::public.incentive_rule_type,
  100.00,
  'USD',
  true,
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES (
  'Quality Excellence Bonus',
  'Quarterly bonus for maintaining zero defects',
  'performance_bonus'::public.incentive_rule_type,
  250.00,
  'USD',
  true,
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES (
  'Overtime Premium - Standard',
  'Standard overtime multiplier at 50%',
  'overtime_bonus'::public.incentive_rule_type,
  0,
  'USD',
  true,
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES (
  'Overtime Premium - Holiday',
  'Holiday overtime multiplier at 100%',
  'overtime_bonus'::public.incentive_rule_type,
  0,
  'USD',
  true,
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

INSERT INTO public.incentive_rules (name, description, incentive_type, amount, currency_code, is_active, effective_from) 
VALUES (
  'Tardiness Penalty',
  'Deduction for excessive lateness',
  'penalty_adjustment'::public.incentive_rule_type,
  -50.00,
  'USD',
  true,
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

-- Verify incentive rules insertion
SELECT 'Incentive rules inserted: ' || COUNT(*)::TEXT as status FROM public.incentive_rules;

-- Final summary
DO $$
DECLARE
  v_skills_count INTEGER;
  v_rules_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_skills_count FROM public.skills;
  SELECT COUNT(*) INTO v_rules_count FROM public.incentive_rules;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SEED DATA MIGRATION COMPLETE ===';
  RAISE NOTICE 'Skills: % (expected 12)', v_skills_count;
  RAISE NOTICE 'Incentive Rules: % (expected 5)', v_rules_count;
  RAISE NOTICE '';
  
  IF v_skills_count = 12 AND v_rules_count = 5 THEN
    RAISE NOTICE '✓✓✓ SEED DATA SUCCESSFULLY INSERTED ✓✓✓';
  END IF;
END $$;

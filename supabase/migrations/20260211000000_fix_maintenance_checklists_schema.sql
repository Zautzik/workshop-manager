-- Fix maintenance_checklists table schema
-- The table was originally created in migration 20251201121439 with different columns.
-- The newer migration (20260207121500) used CREATE TABLE IF NOT EXISTS which had no effect.
-- This migration adds the columns the checklist editor component actually needs.

-- Add missing columns
ALTER TABLE public.maintenance_checklists 
  ADD COLUMN IF NOT EXISTS machine_type TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_type TEXT,
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_estimated_time INTEGER NOT NULL DEFAULT 0;

-- Backfill machine_type from existing records
UPDATE public.maintenance_checklists 
SET machine_type = 'Unknown' 
WHERE machine_type IS NULL;

-- Make machine_type NOT NULL after backfill
ALTER TABLE public.maintenance_checklists
  ALTER COLUMN machine_type SET NOT NULL;

-- These lived in 20260207121500_maintenance_checklists.sql, on the columns it
-- assumed CREATE TABLE IF NOT EXISTS had just added. It hadn't (the table
-- already existed) — moved here, where machine_type/maintenance_type are
-- guaranteed to exist.
CREATE INDEX IF NOT EXISTS idx_maintenance_checklists_machine_type
  ON public.maintenance_checklists(machine_type);

CREATE INDEX IF NOT EXISTS idx_maintenance_checklists_maintenance_type
  ON public.maintenance_checklists(maintenance_type);

-- Fix RLS policies - allow all authenticated users to manage checklists
DROP POLICY IF EXISTS "Admins and supervisors can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "Managers and admins can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "All authenticated users can manage checklists" ON public.maintenance_checklists;

CREATE POLICY "All authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

-- =====================================================
-- Sample Checklist Templates
-- =====================================================
-- Moved from 20260207121500_maintenance_checklists.sql: they insert into
-- machine_type, which only exists from this migration onward on a fresh
-- bootstrap. Guarded by name so re-running this migration doesn't duplicate
-- the seed rows.

-- `frequency` (TEXT NOT NULL, 20251201121439) is the column the original
-- INSERTs never set — invisible until a fresh bootstrap actually hits the
-- constraint, since every environment that already had rows here got past
-- CREATE TABLE IF NOT EXISTS without ever creating a fresh one.
INSERT INTO public.maintenance_checklists (name, frequency, machine_type, maintenance_type, items, total_estimated_time)
SELECT
  'Offset Printer Monthly Maintenance',
  'monthly',
  'Offset Printer',
  'preventive',
  jsonb_build_array(
    jsonb_build_object(
      'id', '1',
      'step', 1,
      'title', 'Clean ink rollers',
      'description', 'Carefully clean all ink rollers with appropriate solvent. Remove any dried ink or debris.',
      'estimatedTime', 45,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Cleaning solvent', 'Lint-free cloth', 'Soft brush')
    ),
    jsonb_build_object(
      'id', '2',
      'step', 2,
      'title', 'Check and adjust water fountain balance',
      'description', 'Verify water fountain pH and conductivity. Adjust settings if needed.',
      'estimatedTime', 30,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('pH meter', 'Conductivity meter')
    ),
    jsonb_build_object(
      'id', '3',
      'step', 3,
      'title', 'Oil all moving parts',
      'description', 'Apply light machine oil to all pivot points and moving components.',
      'estimatedTime', 30,
      'priority', 'medium',
      'toolsRequired', jsonb_build_array('Light machine oil', 'Oil can')
    ),
    jsonb_build_object(
      'id', '4',
      'step', 4,
      'title', 'Inspect and replace gripper pads if needed',
      'description', 'Check gripper pads for wear. Replace if showing significant damage.',
      'estimatedTime', 40,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Replacement gripper pads', 'Wrench set')
    ),
    jsonb_build_object(
      'id', '5',
      'step', 5,
      'title', 'Test print quality',
      'description', 'Run test prints to verify color accuracy and registration.',
      'estimatedTime', 20,
      'priority', 'medium',
      'toolsRequired', jsonb_build_array('Test stock')
    )
  ),
  165
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_checklists WHERE name = 'Offset Printer Monthly Maintenance'
);

INSERT INTO public.maintenance_checklists (name, frequency, machine_type, maintenance_type, items, total_estimated_time)
SELECT
  'Guillotine Safety & Maintenance Check',
  'monthly',
  'Guillotine',
  'preventive',
  jsonb_build_array(
    jsonb_build_object(
      'id', '1',
      'step', 1,
      'title', 'Safety inspection - blade guard',
      'description', 'Verify blade guard is functioning properly and all safety mechanisms engage correctly.',
      'estimatedTime', 20,
      'priority', 'critical',
      'toolsRequired', jsonb_build_array('Safety test checklist')
    ),
    jsonb_build_object(
      'id', '2',
      'step', 2,
      'title', 'Sharpen blade',
      'description', 'Professionally sharpen the cutting blade. Check for chips or cracks.',
      'estimatedTime', 90,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Sharpening stone', 'Blade hone', 'Magnifying glass')
    ),
    jsonb_build_object(
      'id', '3',
      'step', 3,
      'title', 'Check blade alignment',
      'description', 'Verify blade is perfectly aligned and parallel to the base.',
      'estimatedTime', 30,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Alignment gauge', 'Adjustment wrench')
    ),
    jsonb_build_object(
      'id', '4',
      'step', 4,
      'title', 'Lubricate moving parts',
      'description', 'Oil all guide rails and moving components.',
      'estimatedTime', 15,
      'priority', 'medium',
      'toolsRequired', jsonb_build_array('Machine oil', 'Oil can')
    )
  ),
  155
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_checklists WHERE name = 'Guillotine Safety & Maintenance Check'
);

INSERT INTO public.maintenance_checklists (name, frequency, machine_type, maintenance_type, items, total_estimated_time)
SELECT
  'Digital Printer Quarterly Inspection',
  'quarterly',
  'Digital Printer',
  'inspection',
  jsonb_build_array(
    jsonb_build_object(
      'id', '1',
      'step', 1,
      'title', 'Electrical safety check',
      'description', 'Inspect all electrical connections. Test ground continuity. Check power cord for damage.',
      'estimatedTime', 25,
      'priority', 'critical',
      'toolsRequired', jsonb_build_array('Multimeter', 'Visual inspection')
    ),
    jsonb_build_object(
      'id', '2',
      'step', 2,
      'title', 'Cooling system check',
      'description', 'Verify cooling fans are working properly and vents are clear of obstruction.',
      'estimatedTime', 15,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Thermometer', 'Compressed air')
    ),
    jsonb_build_object(
      'id', '3',
      'step', 3,
      'title', 'Calibration test',
      'description', 'Run color calibration and verify output matches standards.',
      'estimatedTime', 30,
      'priority', 'high',
      'toolsRequired', jsonb_build_array('Color reference', 'Test prints')
    ),
    jsonb_build_object(
      'id', '4',
      'step', 4,
      'title', 'Document findings',
      'description', 'Record any issues found and recommend actions.',
      'estimatedTime', 10,
      'priority', 'medium',
      'toolsRequired', jsonb_build_array('Inspection form')
    )
  ),
  80
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_checklists WHERE name = 'Digital Printer Quarterly Inspection'
);

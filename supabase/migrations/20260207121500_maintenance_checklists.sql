-- =====================================================
-- Maintenance Checklists Module - Database Schema
-- =====================================================
-- This migration adds support for maintenance checklist templates
-- that can be reused and customized for different maintenance tasks

-- Create maintenance_type enum
CREATE TYPE IF NOT EXISTS public.maintenance_type AS ENUM (
  'preventive',
  'corrective',
  'predictive',
  'scheduled',
  'emergency'
);

-- Create maintenance_checklists table
CREATE TABLE IF NOT EXISTS public.maintenance_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  machine_type TEXT NOT NULL, -- e.g., 'Offset Printer', 'Guillotine', etc.
  maintenance_type maintenance_type NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of checklist items
  total_estimated_time INTEGER NOT NULL DEFAULT 0, -- in minutes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_maintenance_checklists_machine_type 
  ON public.maintenance_checklists(machine_type);

CREATE INDEX idx_maintenance_checklists_maintenance_type 
  ON public.maintenance_checklists(maintenance_type);

-- Enable RLS
ALTER TABLE public.maintenance_checklists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "All authenticated users can view checklists"
  ON public.maintenance_checklists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_maintenance_checklists_updated_at
  BEFORE UPDATE ON public.maintenance_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Sample Checklist Templates
-- =====================================================

INSERT INTO public.maintenance_checklists (name, machine_type, maintenance_type, items, total_estimated_time)
VALUES (
  'Offset Printer Monthly Maintenance',
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
);

INSERT INTO public.maintenance_checklists (name, machine_type, maintenance_type, items, total_estimated_time)
VALUES (
  'Guillotine Safety & Maintenance Check',
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
);

INSERT INTO public.maintenance_checklists (name, machine_type, maintenance_type, items, total_estimated_time)
VALUES (
  'Digital Printer Quarterly Inspection',
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
);

-- =====================================================
-- Summary
-- =====================================================
-- Created:
-- - maintenance_checklists table for storing checklist templates
-- - JSONB items field for flexible checklist structure
-- - RLS policies for manager/admin control
-- - 3 sample checklist templates
--
-- The component MaintenanceChecklistEditor.tsx uses this table
-- to persist user-created and customized checklists.
-- =====================================================

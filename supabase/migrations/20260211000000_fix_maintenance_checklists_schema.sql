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

-- Fix RLS policies - allow all authenticated users to manage checklists
DROP POLICY IF EXISTS "Admins and supervisors can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "Managers and admins can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "All authenticated users can manage checklists" ON public.maintenance_checklists;

CREATE POLICY "All authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

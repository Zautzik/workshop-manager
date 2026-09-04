-- =====================================================
-- Maintenance Checklists Module - Database Schema
-- =====================================================
-- This migration adds support for maintenance checklist templates
-- that can be reused and customized for different maintenance tasks

-- Create maintenance_type enum
-- `CREATE TYPE ... IF NOT EXISTS` is not valid Postgres syntax (unlike
-- CREATE TABLE) — this migration could never have run successfully as
-- written; a from-scratch bootstrap (new environment, `supabase start`)
-- fails here with "syntax error at or near NOT". Guarded the same way the
-- rest of this codebase already guards enum creation (see cost_ledger.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_type') THEN
    CREATE TYPE public.maintenance_type AS ENUM (
      'preventive',
      'corrective',
      'predictive',
      'scheduled',
      'emergency'
    );
  END IF;
END $$;

-- Los datos de ejemplo de abajo usan 'inspection', que no está en la lista de
-- arriba. Sin esto la tercera siembra (Digital Printer Quarterly Inspection)
-- rechaza con «invalid input value for enum maintenance_type».
ALTER TYPE public.maintenance_type ADD VALUE IF NOT EXISTS 'inspection';

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

-- Indexes on machine_type/maintenance_type: moved to
-- 20260211000000_fix_maintenance_checklists_schema.sql. `maintenance_checklists`
-- already existed (20251201121439, columns machine_id/name/description/frequency)
-- by the time this migration runs, so the CREATE TABLE IF NOT EXISTS above is a
-- no-op and these columns don't exist yet on a fresh bootstrap — that fix
-- migration is where they're actually added.

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
-- `maintenance_checklists` already existed (20251201121439) with this same
-- trigger attached — plain CREATE TRIGGER collides with it on a fresh
-- bootstrap ("trigger already exists"). DROP IF EXISTS first, same as every
-- other trigger in this codebase.
DROP TRIGGER IF EXISTS update_maintenance_checklists_updated_at ON public.maintenance_checklists;
CREATE TRIGGER update_maintenance_checklists_updated_at
  BEFORE UPDATE ON public.maintenance_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Sample checklist templates: moved to
-- 20260211000000_fix_maintenance_checklists_schema.sql, after machine_type
-- exists. They insert into that column, which (see note above) isn't there
-- yet at this point in a fresh bootstrap.

-- =====================================================
-- Summary
-- =====================================================
-- Created:
-- - maintenance_checklists table for storing checklist templates
-- - JSONB items field for flexible checklist structure
-- - RLS policies for manager/admin control
--
-- The component MaintenanceChecklistEditor.tsx uses this table
-- to persist user-created and customized checklists.
-- =====================================================

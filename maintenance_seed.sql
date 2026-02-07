-- =====================================================
-- Asset Maintenance Module - Database Seeding
-- =====================================================
-- This SQL seeds the maintenance section with tables and data
-- for tracking machine maintenance, schedules, and history

-- Create maintenance status enum
CREATE TYPE maintenance_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'overdue'
);

-- Create maintenance type enum
CREATE TYPE maintenance_type AS ENUM (
  'preventive',
  'corrective',
  'emergency',
  'inspection',
  'cleaning'
);

-- Create maintenance_schedules table
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  maintenance_type maintenance_type NOT NULL,
  frequency_days INTEGER NOT NULL DEFAULT 30,
  last_maintenance_date TIMESTAMP WITH TIME ZONE,
  next_maintenance_date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  estimated_duration_hours DECIMAL(5,2) DEFAULT 2,
  status maintenance_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create maintenance_logs table (history of maintenance work)
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.maintenance_schedules(id) ON DELETE SET NULL,
  maintenance_type maintenance_type NOT NULL,
  technician_name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  actual_duration_hours DECIMAL(5,2),
  status maintenance_status NOT NULL DEFAULT 'in_progress',
  description TEXT,
  issues_found TEXT,
  parts_replaced TEXT,
  cost DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create maintenance_alerts table (for critical issues)
CREATE TABLE IF NOT EXISTS public.maintenance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'overdue', 'critical', 'warning'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create machine_downtime_logs table
CREATE TABLE IF NOT EXISTS public.machine_downtime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- 'maintenance', 'repair', 'investigation'
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_hours DECIMAL(8,2),
  impact_description TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_downtime_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_schedules
CREATE POLICY "All authenticated users can view maintenance schedules"
  ON public.maintenance_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage maintenance schedules"
  ON public.maintenance_schedules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for maintenance_logs
CREATE POLICY "All authenticated users can view maintenance logs"
  ON public.maintenance_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage maintenance logs"
  ON public.maintenance_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for maintenance_alerts
CREATE POLICY "All authenticated users can view maintenance alerts"
  ON public.maintenance_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage maintenance alerts"
  ON public.maintenance_alerts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for machine_downtime_logs
CREATE POLICY "All authenticated users can view machine downtime logs"
  ON public.machine_downtime_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage machine downtime logs"
  ON public.machine_downtime_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_maintenance_schedules_updated_at
  BEFORE UPDATE ON public.maintenance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_logs_updated_at
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_alerts_updated_at
  BEFORE UPDATE ON public.maintenance_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_machine_downtime_logs_updated_at
  BEFORE UPDATE ON public.machine_downtime_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SEED DATA - Asset Maintenance
-- =====================================================

-- Insert maintenance schedules for each machine
INSERT INTO public.maintenance_schedules (machine_id, maintenance_type, frequency_days, last_maintenance_date, next_maintenance_date, description, estimated_duration_hours) 
SELECT 
  id,
  'preventive',
  30,
  NOW() - INTERVAL '5 days',
  NOW() + INTERVAL '25 days',
  'Monthly preventive maintenance - oil change, belt inspection, calibration',
  4
FROM public.machines
WHERE type = 'offset_printer'
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_schedules (machine_id, maintenance_type, frequency_days, last_maintenance_date, next_maintenance_date, description, estimated_duration_hours)
SELECT 
  id,
  'preventive',
  20,
  NOW() - INTERVAL '3 days',
  NOW() + INTERVAL '17 days',
  'Bi-weekly knife blade sharpening and calibration',
  2
FROM public.machines
WHERE type = 'guillotine'
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_schedules (machine_id, maintenance_type, frequency_days, last_maintenance_date, next_maintenance_date, description, estimated_duration_hours)
SELECT 
  id,
  'preventive',
  25,
  NOW() - INTERVAL '4 days',
  NOW() + INTERVAL '21 days',
  'Die cutter maintenance - pressure adjustment and cleaning',
  3
FROM public.machines
WHERE type = 'die_cutter'
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_schedules (machine_id, maintenance_type, frequency_days, last_maintenance_date, next_maintenance_date, description, estimated_duration_hours)
SELECT 
  id,
  'inspection',
  45,
  NOW() - INTERVAL '10 days',
  NOW() + INTERVAL '35 days',
  'Quarterly inspection - electrical systems and safety checks',
  2
FROM public.machines
WHERE type = 'digital_printer'
ON CONFLICT DO NOTHING;

-- Insert recent maintenance logs
INSERT INTO public.maintenance_logs (machine_id, maintenance_type, technician_name, start_date, end_date, actual_duration_hours, status, description, issues_found, parts_replaced, cost)
VALUES
  ((SELECT id FROM public.machines WHERE name = 'Offset Printer 1' LIMIT 1), 'preventive', 'José Martinez', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '3.5 hours', 3.5, 'completed', 'Monthly preventive maintenance', 'Minor wear on roller', 'Ink roller rebuilt', 250.00),
  ((SELECT id FROM public.machines WHERE name = 'Offset Printer 2' LIMIT 1), 'preventive', 'Carlos López', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '4 hours', 4, 'completed', 'Monthly preventive maintenance', 'None - routine maintenance', 'Oil changed, filters replaced', 180.00),
  ((SELECT id FROM public.machines WHERE name = 'Guillotine 1' LIMIT 1), 'preventive', 'María González', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '1.5 hours', 1.5, 'completed', 'Blade sharpening and alignment', 'Blade slightly dull', 'Blade sharpened', 75.00),
  ((SELECT id FROM public.machines WHERE name = 'Die Cutter' LIMIT 1), 'corrective', 'José Martinez', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '5 hours', 5, 'completed', 'Pressure adjustment issue resolved', 'Hydraulic pressure regulator faulty', 'Pressure regulator replaced', 450.00),
  ((SELECT id FROM public.machines WHERE name = 'Digital Printer' LIMIT 1), 'inspection', 'Luis Rodriguez', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days' + INTERVAL '2 hours', 2, 'completed', 'Quarterly electrical and safety inspection', 'Electrical contacts need cleaning', 'Electrical contacts cleaned and coated', 120.00)
ON CONFLICT DO NOTHING;

-- Insert maintenance alerts
INSERT INTO public.maintenance_alerts (machine_id, alert_type, severity, title, description, is_resolved)
VALUES
  ((SELECT id FROM public.machines WHERE name = 'Offset Printer 3' LIMIT 1), 'overdue', 'high', 'Overdue Maintenance', 'Preventive maintenance overdue by 5 days. Schedule immediately.', false),
  ((SELECT id FROM public.machines WHERE name = 'Guillotine 2' LIMIT 1), 'warning', 'medium', 'Maintenance Due Soon', 'Blade sharpening due in 3 days. Please schedule.', false),
  ((SELECT id FROM public.machines WHERE name = 'Pre-Press Station' LIMIT 1), 'warning', 'medium', 'Cleaning Recommended', 'Machine needs cleaning and calibration check.', false),
  ((SELECT id FROM public.machines WHERE name = 'Manual Workshop' LIMIT 1), 'warning', 'low', 'Routine Inspection Scheduled', 'Monthly inspection scheduled for next week.', false)
ON CONFLICT DO NOTHING;

-- Insert machine downtime logs
INSERT INTO public.machine_downtime_logs (machine_id, reason, start_time, end_time, duration_hours, impact_description)
VALUES
  ((SELECT id FROM public.machines WHERE name = 'Offset Printer 1' LIMIT 1), 'maintenance', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '3.5 hours', 3.5, 'Preventive maintenance - minimal impact'),
  ((SELECT id FROM public.machines WHERE name = 'Die Cutter' LIMIT 1), 'repair', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '5 hours', 5, 'Hydraulic system repair - production delayed by 5 hours'),
  ((SELECT id FROM public.machines WHERE name = 'Guillotine 1' LIMIT 1), 'maintenance', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '1.5 hours', 1.5, 'Routine blade maintenance - minimal impact'),
  ((SELECT id FROM public.machines WHERE name = 'Offset Printer 2' LIMIT 1), 'maintenance', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '4 hours', 4, 'Scheduled preventive maintenance - planned downtime')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Summary
-- =====================================================
-- Created tables:
-- - maintenance_schedules: Track scheduled maintenance
-- - maintenance_logs: Record completed maintenance work
-- - maintenance_alerts: Alert for overdue or critical maintenance
-- - machine_downtime_logs: Track machine downtime periods
--
-- Seeded with:
-- - Maintenance schedules for all machines (preventive, inspection)
-- - 5 completed maintenance logs with costs
-- - 4 active maintenance alerts
-- - 4 downtime records
--
-- All tables have RLS policies for:
-- - Managers and admins: Full access
-- - All authenticated users: View-only access
-- =====================================================

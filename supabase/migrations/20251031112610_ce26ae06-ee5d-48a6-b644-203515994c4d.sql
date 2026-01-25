-- Create task type enum
CREATE TYPE task_type AS ENUM ('detachment', 'revision', 'packaging', 'printing', 'cutting', 'delivery');

-- Create workers table
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create task_logs table
CREATE TABLE task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE NOT NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  ot_id UUID,
  task_type task_type NOT NULL,
  time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  performance_rating INTEGER NOT NULL DEFAULT 75 CHECK (performance_rating >= 0 AND performance_rating <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create rosters table
CREATE TABLE rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create roster_workers junction table
CREATE TABLE roster_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID REFERENCES rosters(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(roster_id, worker_id)
);

-- Create worker_stats view for aggregated performance
CREATE OR REPLACE VIEW worker_stats AS
SELECT 
  w.id,
  w.name,
  w.department,
  COUNT(tl.id) as total_tasks,
  AVG(tl.time_spent_minutes) as avg_time_minutes,
  AVG(tl.performance_rating) as avg_rating,
  GREATEST(0, 100 - (AVG(tl.time_spent_minutes) * 0.5))::INTEGER as efficiency_score
FROM workers w
LEFT JOIN task_logs tl ON w.id = tl.worker_id
GROUP BY w.id, w.name, w.department;

-- Enable RLS
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_workers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workers
CREATE POLICY "All authenticated users can view workers"
  ON workers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage workers"
  ON workers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for task_logs
CREATE POLICY "All authenticated users can view task logs"
  ON task_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors can insert task logs"
  ON task_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for rosters
CREATE POLICY "All authenticated users can view rosters"
  ON rosters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors can manage rosters"
  ON rosters FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for roster_workers
CREATE POLICY "All authenticated users can view roster workers"
  ON roster_workers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Supervisors can manage roster workers"
  ON roster_workers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'));

-- Create updated_at triggers
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rosters_updated_at
  BEFORE UPDATE ON rosters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- Skill Tech Tree Implementation
-- Adds hierarchical skill relationships, dependencies, and proficiency tracking

-- ============================================================================
-- ENUMS for skill system
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_tree_type') THEN
    CREATE TYPE public.skill_tree_type AS ENUM (
      'foundational',    -- Basic knowledge required before other skills
      'technical',       -- Machine/equipment operation
      'operational',     -- Process and workflow skills
      'supervisory',     -- Management/leadership skills
      'specialized'      -- Specialized/niche skills
    );
  END IF;
END $$;

-- ============================================================================
-- ALTER SKILLS TABLE - Add tech tree support
-- ============================================================================
ALTER TABLE IF EXISTS public.skills
ADD COLUMN IF NOT EXISTS parent_skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS skill_tree_type public.skill_tree_type NOT NULL DEFAULT 'technical',
ADD COLUMN IF NOT EXISTS proficiency_description JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS icon_name TEXT,
ADD COLUMN IF NOT EXISTS position_x INTEGER,
ADD COLUMN IF NOT EXISTS position_y INTEGER,
ADD COLUMN IF NOT EXISTS is_certification_required BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS certification_validity_months INTEGER,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Add indexes for tech tree navigation
CREATE INDEX IF NOT EXISTS idx_skills_parent_skill_id ON public.skills(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_skills_tree_type ON public.skills(skill_tree_type);
CREATE INDEX IF NOT EXISTS idx_skills_display_order ON public.skills(display_order);

-- ============================================================================
-- SKILL DEPENDENCIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  required_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  min_proficiency_required SMALLINT NOT NULL DEFAULT 2,
  is_hard_requirement BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skill_dependencies_unique UNIQUE (skill_id, required_skill_id),
  CONSTRAINT skill_dependencies_proficiency_valid CHECK (min_proficiency_required >= 1 AND min_proficiency_required <= 5),
  CONSTRAINT skill_dependencies_not_self FOREIGN KEY (required_skill_id) REFERENCES public.skills(id)
);

CREATE INDEX IF NOT EXISTS idx_skill_dependencies_skill_id ON public.skill_dependencies(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_dependencies_required_skill_id ON public.skill_dependencies(required_skill_id);

-- ============================================================================
-- SKILL PROFICIENCY DEFINITIONS TABLE
-- For precise level descriptions per skill
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_proficiency_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level SMALLINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  min_hours_required INTEGER DEFAULT NULL,
  can_certify BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proficiency_levels_unique UNIQUE (skill_id, level),
  CONSTRAINT proficiency_levels_valid CHECK (level >= 1 AND level <= 5)
);

CREATE INDEX IF NOT EXISTS idx_proficiency_levels_skill_id ON public.skill_proficiency_levels(skill_id);
CREATE INDEX IF NOT EXISTS idx_proficiency_levels_level ON public.skill_proficiency_levels(level);

-- ============================================================================
-- MACHINE SKILL REQUIREMENTS TABLE
-- Links machines to required skills with minima proficiency
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.machine_skill_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  min_proficiency SMALLINT NOT NULL DEFAULT 2,
  is_critical BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT machine_skill_requirements_unique UNIQUE (machine_id, skill_id),
  CONSTRAINT machine_skill_requirements_proficiency_valid CHECK (min_proficiency >= 1 AND min_proficiency <= 5)
);

CREATE INDEX IF NOT EXISTS idx_machine_skill_requirements_machine_id ON public.machine_skill_requirements(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_skill_requirements_skill_id ON public.machine_skill_requirements(skill_id);

-- ============================================================================
-- UPDATE EMPLOYEE_SKILLS TABLE
-- Add additional tracking columns
-- ============================================================================
ALTER TABLE IF EXISTS public.employee_skills
ADD COLUMN IF NOT EXISTS hours_practiced INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS demonstrated_proficiency_date DATE,
ADD COLUMN IF NOT EXISTS assessor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assessment_method TEXT,
ADD COLUMN IF NOT EXISTS source_of_knowledge TEXT;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_proficiency_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_skill_requirements ENABLE ROW LEVEL SECURITY;

-- Skills: Readable by all authenticated users
DROP POLICY IF EXISTS "skills_select_authenticated" ON public.skills;
CREATE POLICY "skills_select_authenticated"
ON public.skills
FOR SELECT
USING (auth.role() = 'authenticated');

-- Skills: Writable by HR managers
DROP POLICY IF EXISTS "skills_manage_hr" ON public.skills;
CREATE POLICY "skills_manage_hr"
ON public.skills
FOR ALL
USING (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
    AND e.id IN (
      SELECT id FROM public.employees 
      WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (true);

-- Skill dependencies: Readable by authenticated
DROP POLICY IF EXISTS "skill_dependencies_select" ON public.skill_dependencies;
CREATE POLICY "skill_dependencies_select"
ON public.skill_dependencies
FOR SELECT
USING (auth.role() = 'authenticated');

-- Skill dependencies: Writable by HR
DROP POLICY IF EXISTS "skill_dependencies_manage_hr" ON public.skill_dependencies;
CREATE POLICY "skill_dependencies_manage_hr"
ON public.skill_dependencies
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Proficiency levels: Readable by all
DROP POLICY IF EXISTS "proficiency_levels_select" ON public.skill_proficiency_levels;
CREATE POLICY "proficiency_levels_select"
ON public.skill_proficiency_levels
FOR SELECT
USING (auth.role() = 'authenticated');

-- Proficiency levels: Writable by HR
DROP POLICY IF EXISTS "proficiency_levels_manage_hr" ON public.skill_proficiency_levels;
CREATE POLICY "proficiency_levels_manage_hr"
ON public.skill_proficiency_levels
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Machine requirements: Readable by all
DROP POLICY IF EXISTS "machine_skill_requirements_select" ON public.machine_skill_requirements;
CREATE POLICY "machine_skill_requirements_select"
ON public.machine_skill_requirements
FOR SELECT
USING (auth.role() = 'authenticated');

-- Machine requirements: Writable by production manager/HR
DROP POLICY IF EXISTS "machine_skill_requirements_manage" ON public.machine_skill_requirements;
CREATE POLICY "machine_skill_requirements_manage"
ON public.machine_skill_requirements
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- HELPER FUNCTION: Get worker qualification for machine
-- ============================================================================
CREATE OR REPLACE FUNCTION get_worker_machine_qualification(
  p_employee_id UUID,
  p_machine_id UUID
)
RETURNS TABLE (
  can_operate BOOLEAN,
  proficiency_score DECIMAL,
  missing_skills JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH required_skills AS (
    SELECT msr.skill_id, msr.min_proficiency
    FROM public.machine_skill_requirements msr
    WHERE msr.machine_id = p_machine_id
  ),
  employee_proficiencies AS (
    SELECT es.skill_id, es.proficiency_level
    FROM public.employee_skills es
    WHERE es.employee_id = p_employee_id
  )
  SELECT
    (COUNT(CASE WHEN ep.proficiency_level >= rs.min_proficiency THEN 1 END) = COUNT(rs.skill_id))::BOOLEAN as can_operate,
    (COUNT(CASE WHEN ep.proficiency_level >= rs.min_proficiency THEN 1 END)::DECIMAL / NULLIF(COUNT(rs.skill_id), 0))::DECIMAL as proficiency_score,
    COALESCE(
      (
        SELECT jsonb_agg(
          JSONB_BUILD_OBJECT(
            'skill_id', rs2.skill_id,
            'skill_name', s2.name,
            'required_level', rs2.min_proficiency,
            'current_level', COALESCE(ep2.proficiency_level, 0)
          )
        )
        FROM required_skills rs2
        LEFT JOIN public.skills s2 ON s2.id = rs2.skill_id
        LEFT JOIN employee_proficiencies ep2 ON ep2.skill_id = rs2.skill_id
        WHERE ep2.proficiency_level IS NULL OR ep2.proficiency_level < rs2.min_proficiency
      ),
      '[]'::jsonb
    ) as missing_skills
  FROM required_skills rs
  LEFT JOIN employee_proficiencies ep ON ep.skill_id = rs.skill_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- HELPER FUNCTION: Get skill tree hierarchy
-- ============================================================================
CREATE OR REPLACE FUNCTION get_skill_tree_hierarchy(p_root_skill_id UUID DEFAULT NULL)
RETURNS TABLE (
  skill_id UUID,
  name TEXT,
  category TEXT,
  level INTEGER,
  parent_id UUID,
  tree_type public.skill_tree_type
) AS $$
WITH RECURSIVE skill_tree(skill_id, name, category, level, parent_id, tree_type) AS (
  SELECT
    s.id,
    s.name,
    s.category,
    0 as level,
    s.parent_skill_id,
    s.skill_tree_type
  FROM public.skills s
  WHERE (p_root_skill_id IS NULL AND s.parent_skill_id IS NULL)
     OR s.id = p_root_skill_id

  UNION ALL

  SELECT
    s.id,
    s.name,
    s.category,
    st.level + 1,
    s.parent_skill_id,
    s.skill_tree_type
  FROM public.skills s
  INNER JOIN skill_tree st ON s.parent_skill_id = st.skill_id
)
SELECT
  skill_id,
  name,
  category,
  level,
  parent_id,
  tree_type
FROM skill_tree
ORDER BY level, name;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- GRANT PERMISSIONS (assuming schemas are set up)
-- ============================================================================
GRANT SELECT ON public.skills TO authenticated;
GRANT SELECT ON public.skill_dependencies TO authenticated;
GRANT SELECT ON public.skill_proficiency_levels TO authenticated;
GRANT SELECT ON public.machine_skill_requirements TO authenticated;
GRANT EXECUTE ON FUNCTION get_worker_machine_qualification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_skill_tree_hierarchy(UUID) TO authenticated;

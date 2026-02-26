import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/skills/worker-qualifications
 * Get worker's qualifications and machine compatibility
 * Query params: employee_id, machine_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const employeeId = searchParams.get('employee_id');
    const machineId = searchParams.get('machine_id');

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employee_id is required' },
        { status: 400 }
      );
    }

    // Get employee's skills
    const { data: employeeSkills, error: skillsError } = await supabase
      .from('employee_skills')
      .select('skill_id, proficiency_level, certified, skills(id, code, name, category, skill_tree_type)')
      .eq('employee_id', employeeId);

    if (skillsError) throw skillsError;

    // Build skill map
    const skillMap = new Map<string, any>();
    employeeSkills?.forEach((es: any) => {
      skillMap.set(es.skill_id, {
        proficiency_level: es.proficiency_level,
        certified: es.certified,
        ...es.skills,
      });
    });

    if (!machineId) {
      //  Return all skills
      return NextResponse.json({
        employee_id: employeeId,
        skills: Array.from(skillMap.values()),
        qualification_summary: {
          total_skills: skillMap.size,
          certified_count: employeeSkills?.filter((es: any) => es.certified).length || 0,
        },
      });
    }

    // Get machine requirements
    const { data: machineRequirements, error: reqError } = await supabase
      .from('machine_skill_requirements')
      .select('skill_id, min_proficiency, is_critical, skills(id, code, name)')
      .eq('machine_id', machineId);

    if (reqError) throw reqError;

    // Check qualification
    let canOperate = true;
    const qualifications: any[] = [];
    const missingSkills: any[] = [];

    machineRequirements?.forEach((req: any) => {
      const empSkill = skillMap.get(req.skill_id);
      const qualified = empSkill && empSkill.proficiency_level >= req.min_proficiency;

      if (!qualified && req.is_critical) {
        canOperate = false;
      }

      qualifications.push({
        skill_id: req.skill_id,
        skill_name: req.skills?.name,
        required_proficiency: req.min_proficiency,
        current_proficiency: empSkill?.proficiency_level || 0,
        is_critical: req.is_critical,
        qualified,
      });

      if (!qualified) {
        missingSkills.push({
          skill_id: req.skill_id,
          skill_name: req.skills?.name,
          required_proficiency: req.min_proficiency,
          current_proficiency: empSkill?.proficiency_level || 0,
          gap: req.min_proficiency - (empSkill?.proficiency_level || 0),
        });
      }
    });

    return NextResponse.json({
      employee_id: employeeId,
      machine_id: machineId,
      can_operate: canOperate,
      qualifications,
      missing_skills: missingSkills,
      proficiency_score: qualifications.length > 0
        ? (qualifications.filter((q) => q.qualified).length / qualifications.length) * 100
        : 0,
    });
  } catch (error: any) {
    console.error('Error fetching worker qualifications:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch qualifications' },
      { status: 500 }
    );
  }
}

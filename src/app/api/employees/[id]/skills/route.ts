import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/employees/[id]/skills
 * Get all skills assigned to an employee
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { id } = await context.params;

    const { data: skills, error } = await supabase
      .from('employee_skills')
      .select('id, skill_id, proficiency_level, certified, notes, last_assessed_on, skills(id, code, name, category, skill_tree_type)')
      .eq('employee_id', id)
      .order('skills(name)', { ascending: true });

    if (error) throw error;

    return NextResponse.json(skills || []);
  } catch (error: any) {
    console.error('Error fetching employee skills:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employee skills' },
      { status: 500 }
    );
  }
}

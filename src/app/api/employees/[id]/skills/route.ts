import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';

/**
 * GET /api/employees/[id]/skills
 * Get all skills assigned to an employee
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
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

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';

/**
 * POST /api/employees/skills
 * Set an employee's level in a skill.
 *
 * Upserts on the `employee_skills_unique (employee_id, skill_id)` constraint:
 * "this person is now level N at this skill" is the same intent whether or not
 * a row already exists, and callers shouldn't have to branch on it (the skill
 * tree used to run its own insert-or-update browser-direct to decide).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const body = await request.json();

    const {
      employee_id,
      skill_id,
      proficiency_level,
      certified,
      notes,
    } = body;

    if (!employee_id || !skill_id || !proficiency_level) {
      return NextResponse.json(
        { error: 'Se requieren employee_id, skill_id y proficiency_level' },
        { status: 400 }
      );
    }

    const level = Number(proficiency_level);
    if (!Number.isFinite(level) || level < 1 || level > 5) {
      // Mirrors employee_skills_level_valid — fail with a message instead of a 500.
      return NextResponse.json(
        { error: 'El nivel de dominio debe estar entre 1 y 5' },
        { status: 400 }
      );
    }

    const { data: skill, error } = await supabase
      .from('employee_skills')
      .upsert(
        {
          employee_id,
          skill_id,
          proficiency_level: level,
          certified: certified || false,
          notes,
          last_assessed_on: new Date().toISOString(),
        },
        { onConflict: 'employee_id,skill_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(skill, { status: 201 });
  } catch (error: any) {
    console.error('Error assigning skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign skill' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/employees/skills/[id]
 * Update employee skill
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const body = await request.json();
    const url = new URL(request.url);
    const skillId = url.pathname.split('/').pop();
    if (!skillId) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });

    const {
      proficiency_level,
      certified,
      notes,
    } = body;

    const { data: skill, error } = await supabase
      .from('employee_skills')
      .update({
        proficiency_level,
        certified,
        notes,
        last_assessed_on: new Date().toISOString(),
      })
      .eq('id', skillId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(skill);
  } catch (error: any) {
    console.error('Error updating employee skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update skill' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/employees/skills/[id]
 * Remove skill from employee
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const url = new URL(request.url);
    const skillId = url.pathname.split('/').pop();
    if (!skillId) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });

    const { error } = await supabase
      .from('employee_skills')
      .delete()
      .eq('id', skillId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting employee skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete skill' },
      { status: 500 }
    );
  }
}

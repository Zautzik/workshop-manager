import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/skills/[id]
 * Get a specific skill with full details
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { id } = await context.params;

    const { data: skill, error } = await supabase
      .from('skills')
      .select('id, code, name, description, category, skill_tree_type, parent_skill_id, is_active, display_order, is_certification_required, certification_validity_months, icon_name, proficiency_description')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    // Get parent skill
    let parent = null;
    if (skill.parent_skill_id) {
      const { data: parentSkill } = await supabase
        .from('skills')
        .select('id, code, name')
        .eq('id', skill.parent_skill_id)
        .single();
      parent = parentSkill;
    }

    // Get child skills
    const { data: children } = await supabase
      .from('skills')
      .select('id, code, name, skill_tree_type')
      .eq('parent_skill_id', id)
      .order('display_order', { ascending: true });

    // Get dependencies
    const { data: dependencies } = await supabase
      .from('skill_dependencies')
      .select('id, required_skill_id, min_proficiency_required, is_hard_requirement, description, skills!required_skill_id(id, code, name)')
      .eq('skill_id', id);

    // Get proficiency levels
    const { data: proficiencyLevels } = await supabase
      .from('skill_proficiency_levels')
      .select('id, level, title, description, min_hours_required, can_certify')
      .eq('skill_id', id)
      .order('level', { ascending: true });

    // Get machines that require this skill
    const { data: machineRequirements } = await supabase
      .from('machine_skill_requirements')
      .select('id, machine_id, min_proficiency, is_critical, description, machines(id, name, type)')
      .eq('skill_id', id);

    return NextResponse.json({
      ...skill,
      parent,
      children: children || [],
      dependencies: dependencies || [],
      proficiencyLevels: proficiencyLevels || [],
      machineRequirements: machineRequirements || [],
    });
  } catch (error: any) {
    console.error('Error fetching skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch skill' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/skills/[id]
 * Update a skill
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { id } = await context.params;
    const body = await request.json();

    const {
      name,
      description,
      category,
      skill_tree_type,
      parent_skill_id,
      is_active,
      display_order,
      is_certification_required,
      certification_validity_months,
      icon_name,
    } = body;

    const { data: skill, error } = await supabase
      .from('skills')
      .update({
        name,
        description,
        category,
        skill_tree_type,
        parent_skill_id,
        is_active,
        display_order,
        is_certification_required,
        certification_validity_months,
        icon_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json(skill);
  } catch (error: any) {
    console.error('Error updating skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update skill' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/skills/[id]
 * Delete a skill
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { id } = await context.params;

    // Check if skill has children
    const { data: children } = await supabase
      .from('skills')
      .select('id')
      .eq('parent_skill_id', id);

    if (children && children.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete skill with children. Move or delete children first.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('skills')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json(
      { success: true, message: 'Skill deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error deleting skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete skill' },
      { status: 500 }
    );
  }
}

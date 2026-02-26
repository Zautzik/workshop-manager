import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/skills
 * Retrieve all skills or filtered by category/type
 * Query params: category, type, include_hierarchy
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;

    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const includeHierarchy = searchParams.get('include_hierarchy') === 'true';

    let query = supabase
      .from('skills')
      .select('id, code, name, description, category, skill_tree_type, parent_skill_id, is_active, display_order, is_certification_required, certification_validity_months, icon_name');

    if (category) {
      query = query.eq('category', category);
    }
    if (type) {
      query = query.eq('skill_tree_type', type);
    }

    const { data: skills, error } = await query.order('display_order', { ascending: true });

    if (error) throw error;

    if (includeHierarchy) {
      // Enhance with hierarchy information
      const skillsWithHierarchy = await Promise.all(
        (skills || []).map(async (skill) => {
          let parent = null;
          if (skill.parent_skill_id) {
            const { data: parentSkill } = await supabase
              .from('skills')
              .select('id, code, name')
              .eq('id', skill.parent_skill_id)
              .single();
            parent = parentSkill;
          }

          const { data: children } = await supabase
            .from('skills')
            .select('id, code, name')
            .eq('parent_skill_id', skill.id);

          return {
            ...skill,
            parent,
            children: children || [],
          };
        })
      );

      return NextResponse.json(skillsWithHierarchy);
    }

    return NextResponse.json(skills);
  } catch (error: any) {
    console.error('Error fetching skills:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch skills' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills
 * Create a new skill
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();

    const {
      code,
      name,
      description,
      category,
      skill_tree_type = 'technical',
      parent_skill_id,
      is_certification_required = false,
      certification_validity_months,
      icon_name,
    } = body;

    if (!code || !name) {
      return NextResponse.json(
        { error: 'Code and name are required' },
        { status: 400 }
      );
    }

    const { data: skill, error } = await supabase
      .from('skills')
      .insert({
        code: code.toUpperCase(),
        name,
        description,
        category,
        skill_tree_type,
        parent_skill_id,
        is_certification_required,
        certification_validity_months,
        icon_name,
        display_order: 999,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(skill, { status: 201 });
  } catch (error: any) {
    console.error('Error creating skill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create skill' },
      { status: 500 }
    );
  }
}

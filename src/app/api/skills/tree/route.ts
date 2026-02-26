import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/skills/tree
 * Get the complete skill tree hierarchy
 * Query params: root_skill_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const searchParams = request.nextUrl.searchParams;
    const rootSkillId = searchParams.get('root_skill_id');

    // Build the tree structure
    let query = supabase
      .from('skills')
      .select('id, code, name, category, skill_tree_type, parent_skill_id, display_order, icon_name, is_active');

    if (rootSkillId) {
      // Will filter in app
    }

    const { data: allSkills, error } = await query.order('display_order', { ascending: true });

    if (error) throw error;

    // Build tree structure
    const buildTree = (parentId: string | null = null): any[] => {
      const items = (allSkills || [])
        .filter((skill: any) =>
          rootSkillId
            ? skill.parent_skill_id === parentId && (parentId === rootSkillId || skill.parent_skill_id === rootSkillId)
            : skill.parent_skill_id === parentId
        )
        .map((skill: any) => ({
          ...skill,
          children: buildTree(skill.id),
        }));

      return items;
    };

    const tree = buildTree(null);

    return NextResponse.json({
      tree,
      total: allSkills?.length || 0,
    });
  } catch (error: any) {
    console.error('Error fetching skill tree:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch skill tree' },
      { status: 500 }
    );
  }
}

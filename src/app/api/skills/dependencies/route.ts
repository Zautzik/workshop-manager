import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';

/**
 * GET /api/skills/dependencies
 * Get dependencies for a skill or all dependencies
 * Query params: skill_id
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const searchParams = request.nextUrl.searchParams;
    const skillId = searchParams.get('skill_id');

    let query = supabase
      .from('skill_dependencies')
      .select('id, skill_id, required_skill_id, min_proficiency_required, is_hard_requirement, description, skills!required_skill_id(id, code, name)');

    if (skillId) {
      query = query.eq('skill_id', skillId);
    }

    const { data: dependencies, error } = await query;

    if (error) throw error;

    return NextResponse.json(dependencies || []);
  } catch (error: any) {
    console.error('Error fetching dependencies:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dependencies' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/dependencies
 * Create a new skill dependency
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const body = await request.json();

    const {
      skill_id,
      required_skill_id,
      min_proficiency_required = 2,
      is_hard_requirement = true,
      description,
    } = body;

    if (!skill_id || !required_skill_id) {
      return NextResponse.json(
        { error: 'skill_id and required_skill_id are required' },
        { status: 400 }
      );
    }

    const { data: dependency, error } = await supabase
      .from('skill_dependencies')
      .insert({
        skill_id,
        required_skill_id,
        min_proficiency_required,
        is_hard_requirement,
        description,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(dependency, { status: 201 });
  } catch (error: any) {
    console.error('Error creating dependency:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create dependency' },
      { status: 500 }
    );
  }
}

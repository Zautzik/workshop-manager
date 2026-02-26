import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';

/**
 * GET /api/skills/proficiency-levels
 * Get proficiency levels for a skill
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
      .from('skill_proficiency_levels')
      .select('id, skill_id, level, title, description, min_hours_required, can_certify');

    if (skillId) {
      query = query.eq('skill_id', skillId);
    }

    const { data: levels, error } = await query.order('level', { ascending: true });

    if (error) throw error;

    return NextResponse.json(levels || []);
  } catch (error: any) {
    console.error('Error fetching proficiency levels:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch proficiency levels' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/proficiency-levels
 * Create or update a proficiency level
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const body = await request.json();

    const {
      skill_id,
      level,
      title,
      description,
      min_hours_required,
      can_certify = false,
    } = body;

    if (!skill_id || !level || !title || !description) {
      return NextResponse.json(
        { error: 'skill_id, level, title, and description are required' },
        { status: 400 }
      );
    }

    // Try to update existing
    const { data: existing } = await supabase
      .from('skill_proficiency_levels')
      .select('id')
      .eq('skill_id', skill_id)
      .eq('level', level)
      .single();

    let result;
    let isNew = false;

    if (existing) {
      const { data, error } = await supabase
        .from('skill_proficiency_levels')
        .update({
          title,
          description,
          min_hours_required,
          can_certify,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('skill_proficiency_levels')
        .insert({
          skill_id,
          level,
          title,
          description,
          min_hours_required,
          can_certify,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
      isNew = true;
    }

    return NextResponse.json(result, { status: isNew ? 201 : 200 });
  } catch (error: any) {
    console.error('Error upserting proficiency level:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upsert proficiency level' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/skills/proficiency-levels
 * Delete a proficiency level
 * Query params: id
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = supabaseAdmin;
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('skill_proficiency_levels')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting proficiency level:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete proficiency level' },
      { status: 500 }
    );
  }
}

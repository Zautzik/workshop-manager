import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateArticleSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().min(1).max(300),
  category: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  content_md: z.string().min(1),
  is_published: z.boolean().optional(),
});

const UpdateArticleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).optional(),
  content_md: z.string().min(1).optional(),
  is_published: z.boolean().optional(),
});

function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[\\,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const url = req.nextUrl;
    const q = sanitizeSearchTerm((url.searchParams.get('q') ?? '').trim());
    const includeDrafts = url.searchParams.get('include_drafts') === 'true';

    let query = supabaseAdmin
      .from('training_articles')
      .select('*')
      .order('updated_at', { ascending: false });

    if (q) {
      query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);
    }

    if (!includeDrafts || !['admin', 'manager', 'hr_manager'].includes(auth.role ?? '')) {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      console.error('Error fetching training articles:', error);
      return NextResponse.json({ error: 'Failed to fetch training articles' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in training articles GET:', error);
    return NextResponse.json({ error: 'Failed to fetch training articles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = CreateArticleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('training_articles')
      .insert([
        {
          ...parsed.data,
          tags: parsed.data.tags ?? [],
          created_by: auth.id,
          updated_by: auth.id,
          is_published: parsed.data.is_published ?? false,
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error creating training article:', error);
      return NextResponse.json({ error: 'Failed to create training article' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in training articles POST:', error);
    return NextResponse.json({ error: 'Failed to create training article' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = UpdateArticleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('training_articles')
      .update({ ...updates, updated_by: auth.id })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error updating training article:', error);
      return NextResponse.json({ error: 'Failed to update training article' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in training articles PATCH:', error);
    return NextResponse.json({ error: 'Failed to update training article' }, { status: 500 });
  }
}

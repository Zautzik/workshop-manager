import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const SaveSearchSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(100),
  filters: z.record(z.any()).default({}),
  is_default: z.boolean().optional(),
});

const UpdateSearchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  filters: z.record(z.any()).optional(),
  is_default: z.boolean().optional(),
});

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from('saved_searches')
    .select('*')
    .eq('user_id', auth.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching saved searches:', error);
    return NextResponse.json({ error: 'Failed to fetch saved searches' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const parsed = SaveSearchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from('saved_searches')
    .insert([{ ...parsed.data, user_id: auth.id }])
    .select('*')
    .single();

  if (error || !data) {
    console.error('Error saving search:', error);
    return NextResponse.json({ error: 'Failed to save search' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const parsed = UpdateSearchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { id, ...updates } = parsed.data;
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from('saved_searches')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.id)
    .select('*')
    .single();

  if (error || !data) {
    console.error('Error updating saved search:', error);
    return NextResponse.json({ error: 'Failed to update saved search' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = supabaseAdmin as any;
  const { error } = await db
    .from('saved_searches')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.id);

  if (error) {
    console.error('Error deleting saved search:', error);
    return NextResponse.json({ error: 'Failed to delete saved search' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

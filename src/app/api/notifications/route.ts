import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const PatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200).optional(),
  mark_all_read: z.boolean().optional(),
});

// GET /api/notifications?unread=true&limit=50
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const url = req.nextUrl;
    const unread = url.searchParams.get('unread') === 'true';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

    const db = supabaseAdmin as any;

    let query = db
      .from('notifications')
      .select('*')
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (unread) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in notifications GET:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// PATCH /api/notifications
// Body: { ids: string[] } or { mark_all_read: true }
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const db = supabaseAdmin as any;
    const nowIso = new Date().toISOString();

    if (parsed.data.mark_all_read) {
      const { error } = await db
        .from('notifications')
        .update({ is_read: true, read_at: nowIso })
        .eq('user_id', auth.id)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications as read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    const ids = parsed.data.ids ?? [];
    const { error } = await db
      .from('notifications')
      .update({ is_read: true, read_at: nowIso })
      .eq('user_id', auth.id)
      .in('id', ids);

    if (error) {
      console.error('Error marking notifications as read:', error);
      return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in notifications PATCH:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}

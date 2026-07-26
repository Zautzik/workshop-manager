import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const PatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200).optional(),
  mark_all_read: z.boolean().optional(),
});

const CreateSchema = z.object({
  // Only the values the notification_type enum actually accepts. The cost-overrun
  // alert used to send 'cost_overrun' with an `as any` cast, so every one of those
  // inserts was rejected by the DB and swallowed by a silent catch (2026-07 audit).
  type: z.enum([
    'ot_status_changed',
    'ot_approval_required',
    'ot_approved',
    'ot_rejected',
    'report_ready',
    'system_alert',
  ]),
  title: z.string().min(1).max(255),
  message: z.string().max(2000).nullable().optional(),
  resource_type: z.string().max(50).nullable().optional(),
  resource_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/notifications — raise a notification for the signed-in user.
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;
  if (!userId) {
    return NextResponse.json({ error: 'No se pudo identificar al usuario' }, { status: 400 });
  }

  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Notificación inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { metadata, ...rest } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        ...rest,
        user_id: userId,
        metadata: (metadata ?? {}) as never,
        is_read: false,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear la notificación' }, { status: 500 });
  }
}

// GET /api/notifications?unread=true&limit=50
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const url = req.nextUrl;
    const unread = url.searchParams.get('unread') === 'true';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

    let query = supabaseAdmin
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

    const nowIso = new Date().toISOString();

    if (parsed.data.mark_all_read) {
      const { error } = await supabaseAdmin
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
    const { error } = await supabaseAdmin
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

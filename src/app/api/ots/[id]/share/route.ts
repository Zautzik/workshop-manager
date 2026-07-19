import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// POST /api/ots/[id]/share — fetch (or regenerate) the OT's public tracker link.
// Regenerating mints a fresh share_token, which instantly kills every
// previously shared link — that's the revocation story the audit asked for.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de OT inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const regenerate = body?.regenerate === true;

  if (regenerate) {
    const { data, error } = await supabaseAdmin
      .from('ots')
      .update({ share_token: crypto.randomUUID() } as any)
      .eq('id', id)
      .select('share_token' as any)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: 'No se pudo regenerar el enlace' }, { status: 500 });
    }
    return NextResponse.json({ share_token: (data as any).share_token, regenerated: true });
  }

  const { data, error } = await supabaseAdmin
    .from('ots')
    .select('share_token' as any)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
  }
  return NextResponse.json({ share_token: (data as any).share_token, regenerated: false });
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// PATCH /api/vistos-buenos/[id] — update status (e.g. mark signed).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.status) patch.status = b.status;
  if (b.signed_by_name !== undefined) patch.signed_by_name = b.signed_by_name;
  if (b.status === 'signed') patch.signed_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('vistos_buenos' as any)
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

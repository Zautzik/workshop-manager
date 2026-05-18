import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/track/[token]  — public, no auth required
// token = OT UUID (acts as an unguessable share token)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Basic UUID format guard to prevent injection attempts
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin as any)
    .from('ots')
    .select('id, ot_number, client_name, status, priority, created_at, due_date, description')
    .eq('id', token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
  }

  return NextResponse.json(data);
}

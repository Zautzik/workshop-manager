import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/track/[token] — public, no auth required.
// token = ots.share_token (a dedicated random uuid, NOT the primary key —
// see migration 20260717120000: leaked internal ids no longer grant access,
// and regenerating the token revokes every previously shared link).
//
// Returns only client-safe fields: no prices, no internal notes, no ids.
// The stage timeline comes from ot_status_history (dates + statuses only).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Enlace inválido' }, { status: 400 });
  }

  const { data: ot, error } = await supabaseAdmin
    .from('ots')
    .select('id, ot_number, client_name, product_name, quantity, status, deadline, created_at')
    .eq('share_token' as any, token)
    .maybeSingle();

  if (error || !ot) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const { data: history } = await supabaseAdmin
    .from('ot_status_history')
    .select('to_status, created_at')
    .eq('ot_id', ot.id)
    .eq('rollback', false)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    ot_number: ot.ot_number,
    client_name: ot.client_name,
    product_name: ot.product_name,
    quantity: ot.quantity,
    status: ot.status,
    deadline: ot.deadline,
    created_at: ot.created_at,
    history: (history ?? []).map((h) => ({ status: h.to_status, at: h.created_at })),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// Statuses where an OT is in (or past) the dispatch phase — the ones the
// Despachos desk cares about.
const DISPATCHABLE = ['ready_for_delivery', 'in_delivery', 'completed'];

// GET /api/ots/fulfillment[?phase=dispatch] — per-OT dispatched/invoiced roll-up.
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const phase = new URL(req.url).searchParams.get('phase');

  let query = supabaseAdmin
    .from('ot_fulfillment' as any)
    .select('*')
    .order('ot_number', { ascending: false });

  if (phase === 'dispatch') {
    query = query.in('status', DISPATCHABLE);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

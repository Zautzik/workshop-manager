import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/inventory/material-cost — per-SKU catalog estimate vs purchase-weighted
// real cost (material_cost_v). Materials with real lots first.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('material_cost_v' as any)
    .select('*')
    .order('lot_count', { ascending: false })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

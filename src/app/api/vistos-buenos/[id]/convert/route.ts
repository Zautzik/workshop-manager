import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// POST /api/vistos-buenos/[id]/convert — signed VB → prefilled OT (+ estimate
// frozen into the cost ledger). Idempotent (returns the existing OT if already done).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { data, error } = await supabaseAdmin.rpc('convert_vb_to_ot' as any, { p_vb_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ot_id: data });
}

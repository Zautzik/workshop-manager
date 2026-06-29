import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, canActOnSalesRow } from '@/lib/sales-scope';

// POST /api/vistos-buenos/[id]/convert — signed VB → prefilled OT (+ estimate
// frozen into the cost ledger). Idempotent (returns the existing OT if already done).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Ownership: a vendedor may only convert their own quote.
  const scope = await resolveSalesScope(auth);
  if (!scope.all) {
    const { data: owner } = await supabaseAdmin
      .from('vistos_buenos' as any)
      .select('salesman_id')
      .eq('id', id)
      .single();
    if (!owner || !canActOnSalesRow(scope, (owner as any).salesman_id)) {
      return NextResponse.json({ error: 'No autorizado sobre esta cotización.' }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin.rpc('convert_vb_to_ot' as any, { p_vb_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ot_id: data });
}

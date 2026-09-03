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

  if (error) {
    // El mensaje crudo de Postgres llegaba tal cual a quien cotiza — "numeric
    // field overflow" no le dice a un vendedor qué corregir (auditoría
    // 2026-09, cantidades extremas). 22003 es numeric_value_out_of_range: la
    // única causa real es un número que no entra en la columna. El resto de
    // errores del RPC quedan igual de opacos que antes — se loguean acá y se
    // devuelve un mensaje genérico en vez del texto interno de la base.
    console.error('convert_vb_to_ot failed:', error);
    const message = error.code === '22003'
      ? 'Alguno de los montos o cantidades es demasiado grande para guardarse. Revisá la cantidad, las medidas o el precio antes de reintentar.'
      : 'No se pudo crear la OT a partir de esta cotización. Intentá de nuevo o avisá a soporte.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ot_id: data });
}

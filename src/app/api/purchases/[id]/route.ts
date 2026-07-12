import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const UpdateOCSchema = z.object({
  supplier: z.string().min(1).max(255).optional(),
  supplier_rut: z.string().max(50).optional().nullable(),
  ot_id: z.string().uuid().optional().nullable(),
  total_cost: z.coerce.number().min(0).optional(),
  status: z.enum(['draft', 'sent', 'received', 'invoiced', 'closed', 'cancelled']).optional(),
  expected_date: z.string().optional().nullable(),
  certification_details: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// PATCH /api/purchases/[id] — update an OC and re-feed the cost ledger.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateOCSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('purchases' as any)
    .update(parsed.data as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // OT link / status / total may have changed → re-derive the ledger line.
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: id });

  return NextResponse.json({ data });
}

// DELETE /api/purchases/[id] — remove an OC and its ledger line.
// FSSC guard: an OC with received lots or registered facturas is part of the
// traceability chain (lote → OC → proveedor) and must not vanish — deleting it
// orphaned lots with dangling purchase_id (found in the 2026-07 audit).
// Those OCs can only be cancelled (status = 'cancelled'), never deleted.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const [lotsResult, invoicesResult] = await Promise.all([
    supabaseAdmin
      .from('inventory_lots' as any)
      .select('id', { count: 'exact', head: true })
      .eq('purchase_id', id),
    supabaseAdmin
      .from('purchase_invoices' as any)
      .select('id', { count: 'exact', head: true })
      .eq('purchase_id', id),
  ]);

  if ((lotsResult.count ?? 0) > 0 || (invoicesResult.count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'No se puede eliminar: la OC tiene lotes recibidos o facturas asociadas (trazabilidad FSSC). Anúlala en su lugar.',
        code: 'OC_HAS_TRACEABILITY',
      },
      { status: 409 }
    );
  }

  // Drop the OC's ledger line first (no FK from cost lines to purchases).
  await supabaseAdmin.from('ot_cost_lines' as any).delete().eq('ref_type', 'oc').eq('ref_id', id);

  const { error } = await supabaseAdmin.from('purchases' as any).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

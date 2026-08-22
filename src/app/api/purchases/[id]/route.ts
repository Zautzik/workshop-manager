import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

/**
 * GET /api/purchases/[id] — la OC con sus líneas pedidas y lo ya recibido por
 * línea.
 *
 * `receive_oc_into_lot` no toca `purchase_items` — el lote nace en
 * `inventory_lots` enlazado sólo por `purchase_id` + `item_id` (ver
 * 20260816130000). Lo recibido de cada línea es entonces una suma aparte, no
 * una columna: se agrega acá para que el diálogo de recepción pueda mostrar
 * pedido/recibido/pendiente por línea sin que cada pantalla la recalcule a su
 * manera.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const [purchaseResult, itemsResult, lotsResult] = await Promise.all([
    supabaseAdmin.from('purchases' as any).select('*').eq('id', id).maybeSingle(),
    supabaseAdmin
      .from('purchase_items')
      .select('id, item_id, quantity, unit_cost, description, inventory_items(name, sku, unit)')
      .eq('purchase_id', id),
    supabaseAdmin
      .from('inventory_lots')
      .select('item_id, quantity_received')
      .eq('purchase_id', id),
  ]);

  if (purchaseResult.error) {
    return NextResponse.json({ error: purchaseResult.error.message }, { status: 500 });
  }
  if (!purchaseResult.data) {
    return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 });
  }
  if (itemsResult.error) {
    return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
  }

  const recibidoPorItem = new Map<string, number>();
  for (const lot of (lotsResult.data ?? []) as { item_id: string; quantity_received: number }[]) {
    recibidoPorItem.set(lot.item_id, (recibidoPorItem.get(lot.item_id) ?? 0) + Number(lot.quantity_received ?? 0));
  }

  const items = (itemsResult.data ?? []).map((line: any) => {
    const ordered = Number(line.quantity ?? 0);
    const received = recibidoPorItem.get(line.item_id) ?? 0;
    return {
      id: line.id,
      item_id: line.item_id,
      item_name: line.inventory_items?.name ?? null,
      item_sku: line.inventory_items?.sku ?? null,
      unit: line.inventory_items?.unit ?? null,
      description: line.description,
      quantity: ordered,
      unit_cost: line.unit_cost,
      received_quantity: received,
      remaining: Math.max(0, ordered - received),
    };
  });

  return NextResponse.json({ data: { ...(purchaseResult.data as object), items } });
}

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

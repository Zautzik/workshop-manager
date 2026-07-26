import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Stock movements — the single writer of lot availability (a DB trigger applies
 * each transaction to its lot). Was browser-direct; now gated and validated.
 */
const TxSchema = z
  .object({
    item_id: z.string().uuid(),
    lot_id: z.string().uuid().nullable().optional(),
    tx_type: z.enum([
      'purchase',
      'consumption',
      'adjustment_in',
      'adjustment_out',
      'return_to_stock',
    ]),
    quantity: z.coerce.number().gt(0),
    unit_cost: z.coerce.number().min(0).nullable().optional(),
    work_order_id: z.string().uuid().nullable().optional(),
    reference_code: z.string().max(255).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((tx) => tx.tx_type !== 'consumption' || !!tx.work_order_id, {
    // Consumption with no OT is how material cost goes missing from a job.
    message: 'Un consumo debe indicar la OT que lo consume',
    path: ['work_order_id'],
  });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const parsed = TxSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Movimiento inválido', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const tx = parsed.data;

    // Don't let a consumption drive a lot negative — the plant can't consume
    // material it doesn't have, and a negative balance corrupts costing.
    if ((tx.tx_type === 'consumption' || tx.tx_type === 'adjustment_out') && tx.lot_id) {
      const { data: lot } = await supabaseAdmin
        .from('inventory_lots')
        .select('quantity_available, lot_number')
        .eq('id', tx.lot_id)
        .maybeSingle();

      if (lot && Number(lot.quantity_available) < tx.quantity) {
        return NextResponse.json(
          {
            error: `El lote ${lot.lot_number} solo tiene ${lot.quantity_available} disponible(s); no se pueden retirar ${tx.quantity}.`,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_stock_transactions')
      .insert({
        item_id: tx.item_id,
        lot_id: tx.lot_id ?? null,
        tx_type: tx.tx_type,
        quantity: tx.quantity,
        unit_cost: tx.unit_cost ?? null,
        work_order_id: tx.work_order_id ?? null,
        reference_code: tx.reference_code ?? null,
        notes: tx.notes ?? null,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar el movimiento' }, { status: 500 });
  }
}

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
    // Los códigos válidos siguen acotados por el enum de Postgres; cuál de
    // ellos EXIGE una OT ya no lo decide esta lista, lo decide `movement_types`
    // (ver el .refine de abajo). Agregar un tipo nuevo ya no pide tocar este
    // enum de Zod y esta ruta a la vez -- sólo la tabla.
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
  .refine(
    (tx) => (tx.tx_type !== 'consumption' && tx.tx_type !== 'adjustment_out') || !!tx.lot_id,
    {
      // `lot_id` era opcional acá, pero el trigger que escribe
      // `inventory_lots.quantity_available` lo exige sin condición para un
      // retiro -- sin él, el movimiento se guardaba en el ledger y el stock
      // agregado nunca bajaba, un 500 crudo en inglés en vez de este 400.
      // Encontrado en vivo (auditoría 2026-08-30).
      message: 'Un consumo o ajuste de salida debe indicar de qué lote sale, para poder descontarlo.',
      path: ['lot_id'],
    },
  );

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

    // Si este tipo exige OT lo dice `movement_types`, no un `=== 'consumption'`
    // hardcodeado — el mismo dato que ya usa el trigger para saber si suma o
    // resta stock.
    const { data: movementType, error: movementTypeErr } = await supabaseAdmin
      .from('movement_types')
      .select('requires_ot, active')
      .eq('code', tx.tx_type)
      .maybeSingle();
    if (movementTypeErr) {
      return NextResponse.json({ error: 'No se pudo validar el tipo de movimiento' }, { status: 500 });
    }
    if (!movementType?.active) {
      return NextResponse.json({ error: `El tipo de movimiento "${tx.tx_type}" no está activo.` }, { status: 400 });
    }
    if (movementType.requires_ot && !tx.work_order_id) {
      return NextResponse.json(
        { error: 'Movimiento inválido', details: { work_order_id: ['Un consumo debe indicar la OT que lo consume'] } },
        { status: 400 },
      );
    }

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
      // Traducido por si el trigger rechaza algo que el Zod de arriba no
      // alcanzó a nombrar -- el mismo principio que ya aplica ot_requirements.
      const humano = /requires lot_id/i.test(error.message)
        ? 'Este movimiento necesita el lote del que sale, para poder descontarlo.'
        : error.message;
      return NextResponse.json({ error: humano }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar el movimiento' }, { status: 500 });
  }
}

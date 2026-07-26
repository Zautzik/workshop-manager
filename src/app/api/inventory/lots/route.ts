import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Manual lot creation (goods that arrive outside an OC).
 *
 * Availability invariant — established by migration 20260710121000 after the
 * receipt double-count bug: **the stock transaction is the single writer of
 * `quantity_available`**. A lot is born at 0 and the trigger credits it. The
 * old browser-direct form let the user type `quantity_available` straight in,
 * which desynced the lot from its transaction ledger. This route ignores any
 * client-supplied availability and opens the lot at 0, then records the opening
 * balance as a real `purchase` transaction so the ledger stays the source of truth.
 */
const LotSchema = z.object({
  item_id: z.string().uuid(),
  lot_number: z.string().min(1).max(150),
  quantity_received: z.coerce.number().min(0).default(0),
  unit_cost: z.coerce.number().min(0).default(0),
  received_date: z.string().min(1).optional(),
  supplier_name: z.string().max(255).nullable().optional(),
  certification_code: z.string().max(255).nullable().optional(),
  certification_expires_on: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = LotSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del lote', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const receivedDate = input.received_date || new Date().toISOString().split('T')[0];

    const { data: lot, error } = await supabaseAdmin
      .from('inventory_lots')
      .insert({
        item_id: input.item_id,
        lot_number: input.lot_number,
        quantity_received: input.quantity_received,
        // Never trust a client-supplied availability — the ledger owns this.
        quantity_available: 0,
        unit_cost: input.unit_cost,
        received_date: receivedDate,
        supplier_name: input.supplier_name ?? null,
        certification_code: input.certification_code ?? null,
        certification_expires_on: input.certification_expires_on || null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `El lote "${input.lot_number}" ya existe para este ítem.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Opening balance goes through the ledger, exactly like an OC receipt does.
    const warnings: string[] = [];
    if (input.quantity_received > 0) {
      const { error: txError } = await supabaseAdmin.from('inventory_stock_transactions').insert({
        item_id: input.item_id,
        lot_id: lot.id,
        tx_type: 'purchase',
        quantity: input.quantity_received,
        unit_cost: input.unit_cost || null,
        reference_code: `LOTE-${input.lot_number}`,
        notes: 'Saldo inicial del lote (ingreso manual)',
      });

      if (txError) {
        console.error('Opening balance transaction failed:', txError);
        warnings.push(
          `El lote se creó pero su saldo inicial no quedó registrado: ${txError.message}`
        );
      }
    }

    return NextResponse.json(
      { ...lot, ...(warnings.length ? { warnings } : {}) },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'No se pudo crear el lote' }, { status: 500 });
  }
}

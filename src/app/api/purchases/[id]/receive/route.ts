import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const ReceiveSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().min(0).optional().nullable(),
  lot_number: z.string().max(100).optional().nullable(),
  cert_code: z.string().max(100).optional().nullable(),
  cert_expires: z.string().optional().nullable(),
});

// POST /api/purchases/[id]/receive — receive a material from an OC into a lot
// (purchase_id linked), record the stock movement, advance the OC to 'received'.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReceiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const { data, error } = await supabaseAdmin.rpc('receive_oc_into_lot' as any, {
    p_purchase_id: id,
    p_item_id: d.item_id,
    p_quantity: d.quantity,
    p_unit_cost: d.unit_cost ?? null,
    p_lot_number: d.lot_number ?? null,
    p_cert_code: d.cert_code ?? null,
    p_cert_expires: d.cert_expires ?? null,
    // Receipt against an OT-linked OC auto-records the material as a real
    // cost (workflow_step 'oc_receipt') — attribute it to the acting user.
    p_recorded_by: auth.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ lot_id: data }, { status: 201 });
}

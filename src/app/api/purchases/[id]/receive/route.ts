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

  // El papel llegó: ESO es la señal. Capturarla del acto de recibir, no de que
  // alguien se acuerde de arrastrar la tarjeta y de marcar la pastilla PAP.
  const paper = await advanceOtOnPaperArrival(id);

  return NextResponse.json({ lot_id: data, ...(paper ? { ot: paper } : {}) }, { status: 201 });
}

/**
 * Recibir una OC ligada a una OT mueve la OT a "En Bodega" y marca PAP.
 *
 * Mejor esfuerzo a propósito: el material YA entró al inventario y su costo YA
 * quedó registrado. Si esto falla, el galpón no puede quedar bloqueado — se
 * reporta en la respuesta y queda el arrastre manual, que es como funcionaba
 * antes de todos modos.
 */
async function advanceOtOnPaperArrival(purchaseId: string) {
  try {
    const { data: purchase } = await supabaseAdmin
      .from('purchases' as any)
      .select('ot_id')
      .eq('id', purchaseId)
      .maybeSingle();

    const otId = (purchase as { ot_id?: string | null } | null)?.ot_id;
    if (!otId) return null;

    const { data: ot } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, status, flag_paper_arrived')
      .eq('id', otId)
      .maybeSingle();

    if (!ot) return null;

    const patch: Record<string, unknown> = {};

    // La pastilla PAP ("papel en bodega") sólo se marcaba a mano. Ahora la marca
    // el hecho físico.
    if (!ot.flag_paper_arrived) patch.flag_paper_arrived = true;

    // Sólo avanza desde el casillero donde el papel es lo que falta. Una OT ya
    // en prensa no retrocede a bodega porque llegó una compra tardía.
    const advances = ot.status === 'paper_purchase';
    if (advances) patch.status = 'in_storage';

    if (Object.keys(patch).length === 0) return { ot_number: ot.ot_number, changed: false };

    const { error: updateError } = await supabaseAdmin
      .from('ots')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', otId)
      // Guarda de concurrencia: si alguien la movió mientras recibíamos, no la
      // pisamos.
      .eq('status', ot.status);

    if (updateError) {
      console.warn('Paper arrival did not advance OT:', updateError.message);
      return { ot_number: ot.ot_number, changed: false, warning: updateError.message };
    }

    return {
      ot_number: ot.ot_number,
      changed: true,
      advanced_to: advances ? 'in_storage' : undefined,
      paper_flagged: patch.flag_paper_arrived === true,
    };
  } catch (err) {
    console.warn('Paper arrival hook failed:', err);
    return null;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { lineReceiptVariance } from '@/lib/purchasing';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const ReceiveSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().min(0).optional().nullable(),
  lot_number: z.string().max(100).optional().nullable(),
  cert_code: z.string().max(100).optional().nullable(),
  cert_expires: z.string().optional().nullable(),
  /** Por qué llegó distinto de lo pedido. Lo exige la ruta cuando la diferencia
   *  supera la tolerancia: una merma sin explicación se repite. */
  variance_reason: z.string().max(500).optional().nullable(),
  /** Autorización nominal para recibir con certificado vencido. Sin esto la
   *  función de la base rechaza, que es lo que convierte el campo en control. */
  cert_override_reason: z.string().max(500).optional().nullable(),
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

  // La diferencia contra lo pedido se verifica ACÁ y no en el formulario: es el
  // punto donde se pierde plata en silencio, y un control que sólo vive en la
  // pantalla se saltea con una llamada directa.
  //
  // Se compara contra lo que FALTA, no contra el total de la línea: una línea
  // de 500 recibida en dos entregas de 250 no es una variación en la segunda
  // entrega. `receive_oc_into_lot` no enlaza el lote a la línea, así que lo ya
  // recibido se suma aparte desde `inventory_lots` (mismo cálculo que sirve
  // GET /api/purchases/[id]).
  const [{ data: linea }, { data: lotesPrevios }] = await Promise.all([
    supabaseAdmin
      .from('purchase_items')
      .select('quantity')
      .eq('purchase_id', id)
      .eq('item_id', d.item_id)
      .maybeSingle(),
    supabaseAdmin
      .from('inventory_lots')
      .select('quantity_received')
      .eq('purchase_id', id)
      .eq('item_id', d.item_id),
  ]);

  const pedida = Number((linea as { quantity?: number } | null)?.quantity ?? 0);
  const yaRecibida = ((lotesPrevios ?? []) as { quantity_received: number }[]).reduce(
    (sum, l) => sum + Number(l.quantity_received ?? 0),
    0,
  );

  if (pedida > 0) {
    const { remaining, fueraDeRango } = lineReceiptVariance(pedida, yaRecibida, d.quantity);
    if (fueraDeRango && !d.variance_reason?.trim()) {
      return NextResponse.json(
        {
          error:
            `Faltan ${remaining.toLocaleString('es-CL')} de esta línea y estás recibiendo ` +
            `${d.quantity.toLocaleString('es-CL')}. Anotá por qué antes de guardarlo.`,
          code: 'VARIANZA_SIN_MOTIVO',
          ordered: pedida,
          remaining,
        },
        { status: 422 }
      );
    }
  }

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
    p_variance_reason: d.variance_reason ?? null,
    p_cert_override_reason: d.cert_override_reason ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // El papel llegó: ESO es la señal. Capturarla del acto de recibir, no de que
  // alguien se acuerde de arrastrar la tarjeta y de marcar la pastilla PAP.
  const paper = await advanceOtOnPaperArrival(id, d.item_id);

  return NextResponse.json({ lot_id: data, ...(paper ? { ot: paper } : {}) }, { status: 201 });
}

/**
 * Recibir una OC ligada a una OT mueve la OT a "En Bodega" y marca PAP.
 *
 * Pero sólo cuando lo que llegó es PAPEL. La pastilla y el avance existían
 * antes de que hubiera forma de distinguir un ítem de otro, y disparaban con
 * cualquier recepción de la OC — si la tinta o las cajas de esa misma orden
 * llegaban antes que el papel, la OT se marcaba "papel en bodega" y hasta
 * avanzaba a producción sin que el papel hubiera llegado nunca. `material_kind`
 * es justamente la distinción que faltaba (auditoría 2026-08).
 *
 * Mejor esfuerzo a propósito: el material YA entró al inventario y su costo YA
 * quedó registrado. Si esto falla, el galpón no puede quedar bloqueado — se
 * reporta en la respuesta y queda el arrastre manual, que es como funcionaba
 * antes de todos modos.
 */
async function advanceOtOnPaperArrival(purchaseId: string, itemId: string) {
  try {
    // Cualquier error de acá abajo se lanza a propósito — el catch de esta
    // misma función ya sabe qué hacer con eso (avisar y no bloquear), y
    // devolver silencioso en un error real haría que un corte de red se
    // leyera igual que "esto no es papel" o "la OT ya no existe".
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('inventory_items')
      .select('material_kind')
      .eq('id', itemId)
      .maybeSingle();
    if (itemErr) throw itemErr;

    if ((item as { material_kind?: string | null } | null)?.material_kind !== 'papel') return null;

    const { data: purchase, error: purchaseErr } = await supabaseAdmin
      .from('purchases' as any)
      .select('ot_id')
      .eq('id', purchaseId)
      .maybeSingle();
    if (purchaseErr) throw purchaseErr;

    const otId = (purchase as { ot_id?: string | null } | null)?.ot_id;
    if (!otId) return null;

    const { data: ot, error: otErr } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, status, flag_paper_arrived')
      .eq('id', otId)
      .maybeSingle();
    if (otErr) throw otErr;

    if (!ot) return null;

    const patch: Record<string, unknown> = {};

    // La pastilla PAP ("papel en bodega") sólo se marcaba a mano. Ahora la marca
    // el hecho físico -- esto es verdad haya o no otros requisitos pendientes,
    // así que se marca sin condición.
    if (!ot.flag_paper_arrived) patch.flag_paper_arrived = true;

    // Sólo avanza desde el casillero donde el papel es lo que falta. Una OT ya
    // en prensa no retrocede a bodega porque llegó una compra tardía.
    //
    // Pero "el papel llegó" no es "ya se puede producir": si la OT también
    // pidió tinta especial o envase y esos siguen pendientes, avanzar a
    // "En Bodega" bypasea exactamente la compuerta que existe para esto
    // (REQUISITOS_PENDIENTES en ot-state-machine.ts) -- esa compuerta sólo
    // corre en la transición manual, y este es un segundo escritor que nunca
    // la consultaba. Confirmado en vivo (auditoría 2026-08-30): una OT con
    // tinta Pantone todavía "pendiente" avanzó igual apenas llegó el papel.
    let requisitosPendientes = false;
    if (ot.status === 'paper_purchase') {
      const { data: requisitos, error: reqErr } = await supabaseAdmin
        .from('ot_requirements')
        .select('status')
        .eq('ot_id', otId);
      if (reqErr) throw reqErr;
      requisitosPendientes = ((requisitos ?? []) as { status: string }[]).some(
        (r) => r.status !== 'resuelto' && r.status !== 'no_aplica',
      );
    }

    const advances = ot.status === 'paper_purchase' && !requisitosPendientes;
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
      // Que quede explícito por qué no avanzó, en vez de una OT que se queda
      // quieta sin que nadie sepa que le falta otra cosa además del papel.
      pending_requirements: ot.status === 'paper_purchase' && requisitosPendientes ? true : undefined,
    };
  } catch (err) {
    console.warn('Paper arrival hook failed:', err);
    return null;
  }
}

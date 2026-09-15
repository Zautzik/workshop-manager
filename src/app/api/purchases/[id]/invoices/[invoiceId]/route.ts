import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { threeWayMatch } from '@/lib/purchasing';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const UpdateFacturaSchema = z.object({
  invoice_number: z.string().min(1).max(100).optional(),
  amount: z.coerce.number().min(0).optional(),
  invoice_date: z.string().optional(),
  status: z.enum(['received', 'matched', 'disputed', 'paid']).optional(),
  notes: z.string().max(2000).optional().nullable(),
  /** Por qué se cierra pese a una diferencia. Sólo se exige cuando el calce en
   *  vivo, recalculado acá y no confiado al match_status guardado al crear la
   *  factura, muestra con_diferencia. */
  closure_reason: z.string().max(2000).optional(),
});

// PATCH /api/purchases/[id]/invoices/[invoiceId] — match / pay / dispute a
// factura. Crossing into matched/paid flips the OC's ledger line to actual.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id, invoiceId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateFacturaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  delete patch.closure_reason; // va aparte: sólo se guarda si el calce lo exige.

  // Cerrar (matched/paid) es el momento que importa: se recalcula el calce en
  // vivo — el match_status guardado al crear la factura puede estar viejo si
  // llegó más mercadería o se registró otra factura después— y se exige
  // nombre y motivo cuando se cierra sobre una diferencia real. No se exige
  // que quien aprueba sea distinto de quien registró: eso rompe un escritorio
  // de una sola persona en vez de controlarlo.
  if (parsed.data.status === 'matched' || parsed.data.status === 'paid') {
    patch.matched_at = new Date().toISOString();

    const { data: conciliacion } = await supabaseAdmin
      .from('oc_conciliacion')
      .select('pedido, recibido, facturado')
      .eq('id', id)
      .maybeSingle();
    const c = conciliacion as { pedido?: number; recibido?: number; facturado?: number } | null;
    const calce = threeWayMatch({
      ordered: Number(c?.pedido ?? 0),
      received: Number(c?.recibido ?? 0),
      // `facturado` ya incluye esta factura: a diferencia del POST, acá la
      // fila ya existe en la base.
      invoiced: Number(c?.facturado ?? 0),
    });

    patch.match_status = calce.status;
    patch.match_notes = calce.findings.join(' ') || null;

    if (!calce.payable) {
      const motivo = (parsed.data.closure_reason ?? '').trim();
      if (!motivo) {
        return NextResponse.json(
          {
            error: `Esta factura tiene diferencia (${calce.findings.join(' ')}). Indica un motivo para cerrarla igual.`,
            code: 'MOTIVO_REQUERIDO',
          },
          { status: 422 }
        );
      }
      patch.closure_reason = motivo;
    }

    patch.approved_by = auth.id;
    patch.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .update(patch as any)
    .eq('id', invoiceId)
    .eq('purchase_id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Re-derive the OC's ledger line (committed ↔ actual).
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: id });

  return NextResponse.json({ data });
}

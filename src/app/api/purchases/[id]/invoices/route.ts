import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { invoiceArithmetic, threeWayMatch } from '@/lib/purchasing';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/purchases/[id]/invoices — facturas de compra for an OC.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .select('*')
    .eq('purchase_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateFacturaSchema = z.object({
  invoice_number: z.string().min(1).max(100),
  amount: z.coerce.number().min(0),
  invoice_date: z.string().optional(),
  status: z.enum(['received', 'matched', 'disputed', 'paid']).default('received'),
  notes: z.string().max(2000).optional().nullable(),
  /** El RUT del emisor con el folio forman la identidad de la factura. Sin el
   *  RUT no se puede detectar un folio repetido, y pagar dos veces la misma
   *  factura es de los errores más caros y más silenciosos que existen. */
  issuer_rut: z.string().max(20).optional().nullable(),
  net: z.coerce.number().min(0).optional().nullable(),
  vat: z.coerce.number().min(0).optional().nullable(),
});

// POST /api/purchases/[id]/invoices — register a factura against an OC.
// If it lands matched/paid, the OC's ledger line flips committed → actual.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateFacturaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // ── La aritmética del documento ─────────────────────────────────────────
  //
  // Neto + IVA = total, atajado en la puerta. Un dígito de más en el neto pasa
  // desapercibido semanas y desordena el costo de toda OT que tocó ese papel.
  if (d.net != null && d.vat != null) {
    const cuadra = invoiceArithmetic(d.net, d.vat, d.amount);
    if (!cuadra.ok) {
      return NextResponse.json({ error: cuadra.message, code: 'NO_CUADRA' }, { status: 422 });
    }
  }

  // ── El calce a tres bandas ──────────────────────────────────────────────
  //
  // Se hace ANTES de guardar y decide en qué estado nace la factura. Guardarla
  // como buena y conciliar después es lo que produce pagos que nadie revisó.
  const { data: conciliacion } = await supabaseAdmin
    .from('oc_conciliacion')
    .select('pedido, recibido, facturado')
    .eq('id', id)
    .maybeSingle();

  const c = conciliacion as { pedido?: number; recibido?: number; facturado?: number } | null;
  const calce = threeWayMatch({
    ordered: Number(c?.pedido ?? 0),
    received: Number(c?.recibido ?? 0),
    // Lo ya facturado más ESTA factura: es el total que quedaría.
    invoiced: Number(c?.facturado ?? 0) + d.amount,
  });

  // Cobrar de más no se aprueba solo. El estado que pide el cliente de la API
  // se respeta sólo si el calce lo permite: una factura no se marca «pagada»
  // porque el formulario lo diga.
  const estadoFinal = calce.payable ? d.status : 'disputed';
  const matched = estadoFinal === 'matched' || estadoFinal === 'paid';

  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .insert({
      purchase_id: id,
      invoice_number: d.invoice_number,
      amount: d.amount,
      invoice_date: d.invoice_date ?? new Date().toISOString().slice(0, 10),
      status: estadoFinal,
      matched_at: matched ? new Date().toISOString() : null,
      notes: d.notes ?? null,
      issuer_rut: d.issuer_rut?.trim() || null,
      net: d.net ?? null,
      vat: d.vat ?? null,
      match_status: calce.status,
      match_notes: calce.findings.join(' ') || null,
      recorded_by: auth.id,
    } as any)
    .select('*')
    .single();

  if (error) {
    // Folio repetido del mismo emisor: es un duplicado, no un error del sistema.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `La factura ${d.invoice_number} de ese emisor ya está registrada.`, code: 'FOLIO_DUPLICADO' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Receiving a factura advances the OC to 'invoiced'; re-derive the ledger.
  await supabaseAdmin.from('purchases' as any).update({ status: 'invoiced' } as any).eq('id', id);
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: id });

  // El calce viaja en la respuesta para que la pantalla muestre la diferencia
  // en el momento de guardar y no en un informe de fin de mes.
  return NextResponse.json({ data, calce }, { status: 201 });
}

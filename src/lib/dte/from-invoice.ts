import { supabaseAdmin } from '@/integrations/supabase/server';
import type { DteDocument, DteReference } from './types';
import { DTE_TYPES } from './types';

/**
 * Una factura de venta de la base → el documento neutro que se manda al SII.
 *
 * Server-only. Lee la factura, su cliente, su OT y las guías que factura. El
 * monto NO se recalcula acá: la línea lleva las unidades despachadas al precio
 * unitario neto que ya fijó POST /api/sales-invoices, así el neto del DTE es el
 * mismo que quedó registrado (salvo el redondeo del proveedor, que se compara
 * al consultar el estado).
 */
export async function dteFromInvoice(invoiceId: string): Promise<
  { ok: true; doc: DteDocument; invoice: any } | { ok: false; status: number; error: string }
> {
  const { data: inv, error } = await supabaseAdmin
    .from('sales_invoices' as any)
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!inv) return { ok: false, status: 404, error: 'Factura no encontrada' };
  const invoice = inv as any;
  if (invoice.status === 'cancelled') return { ok: false, status: 409, error: 'La factura está anulada' };
  if (!invoice.client_id) return { ok: false, status: 409, error: 'La factura no tiene cliente: el SII exige un receptor con RUT' };

  const [{ data: client }, { data: ot }, { data: guias }] = await Promise.all([
    supabaseAdmin.from('clients').select('*').eq('id', invoice.client_id).maybeSingle(),
    invoice.ot_id
      ? supabaseAdmin.from('ots').select('ot_number, product_name, description, quantity').eq('id', invoice.ot_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('dispatch_guides' as any).select('quantity, dte_type, dte_folio, dispatch_date').eq('invoice_id', invoiceId),
  ]);
  if (!client) return { ok: false, status: 409, error: 'No se encontró el cliente de la factura' };
  const c = client as any;
  const o = ot as any;
  const g = (guias ?? []) as any[];

  const net = Number(invoice.net_amount ?? 0);
  const units = g.reduce((s, x) => s + Number(x.quantity ?? 0), 0);
  // Con guías: unidades despachadas a su precio unitario. Sin guías (factura
  // suelta): una línea por el neto completo.
  const quantity = units > 0 ? units : 1;
  const unitPrice = units > 0 ? Math.round((net / units) * 1e6) / 1e6 : net;
  const description = (o?.product_name || o?.description || 'Servicio de impresión').toString();

  // Sólo se referencian guías que YA son DTE (tienen folio del SII); una guía
  // interna no existe para el SII y referenciarla haría rechazar la factura.
  const references: DteReference[] = g
    .filter((x) => x.dte_folio)
    .map((x) => ({ type: Number(x.dte_type ?? DTE_TYPES.GUIA_DESPACHO), folio: String(x.dte_folio), date: String(x.dispatch_date ?? invoice.issued_date) }));

  const doc: DteDocument = {
    type: DTE_TYPES.FACTURA,
    receptor: {
      rut: c.rut ?? '',
      razonSocial: c.name ?? '',
      giro: c.giro ?? null,
      email: c.email,
      contacto: c.contact_name,
      telefono: c.phone,
      direccion: c.address,
      ciudad: c.city,
      regionCode: c.region_code ?? null,
      comunaCode: c.comuna_code ?? null,
    },
    lines: [{
      productCode: o?.ot_number ? `OT${o.ot_number}` : null,
      description: description.slice(0, 80),
      descriptionExtended: o?.ot_number ? `OT ${o.ot_number}${o?.description && o.description !== description ? ` · ${o.description}` : ''}` : null,
      quantity,
      unitPrice,
      uom: 'UNID',
      afecto: true,
    }],
    references: references.length ? references : undefined,
    dueDate: invoice.due_date ?? null,
    paymentForm: invoice.due_date && invoice.due_date !== invoice.issued_date ? 2 : 1,
    comment: invoice.notes ?? null,
  };
  return { ok: true, doc, invoice };
}

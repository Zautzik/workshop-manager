import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { getDteProvider, validateDte, DTE_TYPES } from '@/lib/dte';
import { dteFromInvoice } from '@/lib/dte/from-invoice';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sales-invoices/[id]/dte — manda la factura al SII por el proveedor.
 * GET  /api/sales-invoices/[id]/dte — consulta su estado en el proveedor.
 *
 * Con la emisión apagada (DTE_PROVIDER sin definir, el estado de hoy) las dos
 * contestan 503 sin tocar la base: la factura sigue siendo el registro interno
 * de siempre. Ver docs/nubox-integracion.md.
 */

const OFF = NextResponse.json(
  { error: 'La facturación electrónica no está conectada. Se configura en Administración › Integraciones.' },
  { status: 503 },
);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;
  const provider = getDteProvider();
  if (!provider) return OFF;
  const { id } = await params;

  const built = await dteFromInvoice(id);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
  const { doc, invoice } = built;

  if (invoice.dte_status === 'accepted' || invoice.dte_status === 'pending') {
    return NextResponse.json({ error: 'Esta factura ya se envió al SII', dte_status: invoice.dte_status }, { status: 409 });
  }

  // Lo que el SII rechazaría, dicho ahora y en palabras.
  const problems = validateDte(doc);
  if (problems.length > 0) {
    return NextResponse.json({ error: 'Faltan datos para emitir', problems }, { status: 422 });
  }

  // La llave se escribe ANTES de llamar. Si la llamada se corta, el reintento
  // usa la misma llave y Nubox devuelve la respuesta original en vez de emitir
  // otra factura. Un rechazo sí estrena llave: es un documento corregido.
  const key: string = invoice.dte_status === 'rejected' || !invoice.dte_idempotency_key ? randomUUID() : invoice.dte_idempotency_key;
  const { error: keyErr } = await supabaseAdmin
    .from('sales_invoices' as any)
    .update({ dte_idempotency_key: key, dte_type: DTE_TYPES.FACTURA, dte_provider: provider.name, dte_errors: null } as any)
    .eq('id', id);
  if (keyErr) return NextResponse.json({ error: keyErr.message }, { status: 500 });

  let result;
  try {
    result = await provider.issue(doc, key);
  } catch (err) {
    // Red caída o timeout: no se sabe si llegó. Queda en `error` con la llave
    // guardada; reintentar es seguro.
    await supabaseAdmin.from('sales_invoices' as any)
      .update({ dte_status: 'error', dte_errors: [{ field: 'red', message: String((err as Error)?.message ?? err) }] } as any)
      .eq('id', id);
    return NextResponse.json({ error: 'No hubo respuesta de Nubox; se puede reintentar sin riesgo de duplicar' }, { status: 502 });
  }

  await supabaseAdmin.from('sales_invoices' as any).update({
    dte_status: result.status,
    dte_provider_id: result.providerId,
    dte_folio: result.folio,
    dte_errors: result.errors.length ? result.errors : null,
    dte_sent_at: new Date().toISOString(),
  } as any).eq('id', id);

  return NextResponse.json(
    { dte_status: result.status, provider_id: result.providerId, errors: result.errors },
    { status: result.ok ? 202 : 422 },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;
  const provider = getDteProvider();
  if (!provider) return OFF;
  const { id } = await params;

  const { data: inv, error } = await supabaseAdmin
    .from('sales_invoices' as any)
    .select('id, dte_status, dte_provider_id, dte_folio')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  const row = inv as any;
  if (!row.dte_provider_id) return NextResponse.json({ dte_status: row.dte_status, folio: row.dte_folio });

  const st = await provider.getStatus(row.dte_provider_id);
  await supabaseAdmin.from('sales_invoices' as any).update({
    dte_status: st.status,
    dte_folio: st.folio ?? row.dte_folio,
    dte_errors: st.errors.length ? st.errors : null,
    dte_checked_at: new Date().toISOString(),
  } as any).eq('id', id);
  return NextResponse.json({ dte_status: st.status, folio: st.folio ?? row.dte_folio, errors: st.errors });
}

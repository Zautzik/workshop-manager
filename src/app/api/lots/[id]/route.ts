import { NextRequest, NextResponse } from 'next/server';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { encodeLotQR } from '@/lib/traceability';

export const dynamic = 'force-dynamic';

/**
 * Un lote, con todo lo que va impreso en su etiqueta.
 *
 * La etiqueta es el eslabón físico: lo que se pega en el pallet y lo que el
 * operario escanea tres semanas después. Por eso lleva más de lo estrictamente
 * necesario para el QR — número, material, proveedor, OC, certificado y
 * vencimiento — porque una etiqueta que sólo tiene un código obliga a consultar
 * el sistema para saber qué es, y en bodega eso no pasa.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('inventory_lots')
    .select(
      'id, lot_number, quantity_received, quantity_available, unit_cost, received_date, ' +
      'supplier_name, certification_code, certification_expires_on, blocked_reason, ' +
      'variance_reason, cert_override_reason, qr_printed_at, purchase_id, ' +
      'inventory_items ( id, name, sku, unit, category, is_certification_required ), ' +
      'purchases ( oc_number )'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 });

  return NextResponse.json({
    lote: Object.assign({ qr: encodeLotQR(id) }, data as unknown as Record<string, unknown>),
  });
}

/** Marcar la etiqueta como impresa, o retener el lote. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    printed?: boolean;
    blocked_reason?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.printed) patch.qr_printed_at = new Date().toISOString();

  // Retener y liberar son la misma operación con signo distinto. Liberar borra
  // el motivo y la marca: el historial queda en el movimiento, no acá.
  if (body.blocked_reason !== undefined) {
    const motivo = body.blocked_reason?.trim() || null;
    patch.blocked_reason = motivo;
    patch.blocked_by = motivo ? auth.id : null;
    patch.blocked_at = motivo ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('inventory_lots').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

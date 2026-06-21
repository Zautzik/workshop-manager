import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { certStatusNow, type CertStatusNow } from '@/lib/fssc';

// GET /api/certifications
// FSSC 22000 incoming-material register: every lot of a certification-required
// item, with the validity status of its food-grade certificate. Powers the
// supplier-approval / incoming-goods control in Calidad.
type CertState = CertStatusNow;

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const [itemsRes, lotsRes] = await Promise.all([
      supabaseAdmin.from('inventory_items').select('id, name, sku, is_certification_required'),
      supabaseAdmin
        .from('inventory_lots')
        .select('id, lot_number, supplier_name, certification_code, certification_expires_on, quantity_available, received_date, item_id')
        .order('certification_expires_on', { ascending: true, nullsFirst: false })
        .limit(5000),
    ]);

    if (itemsRes.error || lotsRes.error) {
      console.error('Error fetching certifications:', itemsRes.error ?? lotsRes.error);
      return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 });
    }

    const items = itemsRes.data ?? [];
    const lots = lotsRes.data ?? [];
    const certItems = new Map(items.filter((i) => i.is_certification_required).map((i) => [i.id, i]));

    const rows = lots
      .filter((l) => certItems.has(l.item_id))
      .map((l) => {
        const item = certItems.get(l.item_id);
        const state: CertState = certStatusNow({ code: l.certification_code, expiresOn: l.certification_expires_on });
        return {
          lot_id: l.id,
          lot_number: l.lot_number,
          item_name: item?.name ?? null,
          item_sku: item?.sku ?? null,
          supplier_name: l.supplier_name,
          certification_code: l.certification_code,
          certification_expires_on: l.certification_expires_on,
          received_date: l.received_date,
          quantity_available: Number(l.quantity_available ?? 0),
          state,
        };
      });

    // Order by urgency: vencido → faltante → por_vencer → sin_vencimiento → vigente.
    const urgency: Record<CertState, number> = { vencido: 0, faltante: 1, por_vencer: 2, sin_vencimiento: 3, vigente: 4 };
    rows.sort((a, b) => urgency[a.state] - urgency[b.state]);

    const count = (s: CertState) => rows.filter((r) => r.state === s).length;
    // "At risk" = in-stock lots that are expired/missing (cannot be safely consumed).
    const atRisk = rows.filter((r) => r.quantity_available > 0 && (r.state === 'vencido' || r.state === 'faltante')).length;

    return NextResponse.json({
      summary: {
        total: rows.length,
        vigente: count('vigente'),
        por_vencer: count('por_vencer'),
        vencido: count('vencido'),
        faltante: count('faltante'),
        sin_vencimiento: count('sin_vencimiento'),
        at_risk: atRisk,
      },
      lots: rows,
    });
  } catch (error) {
    console.error('Error in certifications route:', error);
    return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { certStatusNow, type CertStatusNow } from '@/lib/fssc';

// GET /api/certifications
// FSSC 22000 incoming-material register. The universe is the SAME lot ledger
// Recall reads: every lot of a certification-required item PLUS any lot that
// actually carries a certificate (2026-07 audit: the old flagged-items-only
// filter made a PEFC-certified received lot invisible here while Recall showed
// it — two contradicting truths in Calidad). `cert_required` is a dimension on
// each row, not an existence condition.
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
    const itemById = new Map(items.map((i) => [i.id, i]));

    // In scope: lots of cert-required items (even uncertified — those are the
    // 'faltante' alerts) + any lot carrying a certificate.
    const rows = lots
      .filter((l) => {
        const required = !!itemById.get(l.item_id)?.is_certification_required;
        return required || !!l.certification_code;
      })
      .map((l) => {
        const item = itemById.get(l.item_id);
        const certRequired = !!item?.is_certification_required;
        const state: CertState = certStatusNow({ code: l.certification_code, expiresOn: l.certification_expires_on });
        return {
          lot_id: l.id,
          lot_number: l.lot_number,
          item_name: item?.name ?? null,
          item_sku: item?.sku ?? null,
          cert_required: certRequired,
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

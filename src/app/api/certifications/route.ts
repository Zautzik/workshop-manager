import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { certStatusNow, type CertStatusNow } from '@/lib/fssc';
import { fetchAll } from '@/lib/fetch-all';

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
    // El registro FSSC no puede callarse un lote riesgoso por haberse quedado
    // afuera de un tope silencioso — es exactamente el defecto que truncó
    // Rentabilidad, aplicado esta vez a un registro de cumplimiento en vez de a
    // un margen (auditoría 2026-09-30). `fetchAll` pagina hasta agotar la tabla.
    const [itemsRes, { rows: lots, truncated: lotsTruncated }] = await Promise.all([
      supabaseAdmin.from('inventory_items').select('id, name, sku, is_certification_required'),
      fetchAll<{
        id: string; lot_number: string; supplier_name: string | null;
        certification_code: string | null; certification_expires_on: string | null;
        quantity_available: number | null; received_date: string | null; item_id: string;
      }>((desde, hasta) =>
        supabaseAdmin
          .from('inventory_lots')
          .select('id, lot_number, supplier_name, certification_code, certification_expires_on, quantity_available, received_date, item_id')
          .order('certification_expires_on', { ascending: true, nullsFirst: false })
          .range(desde, hasta) as any,
      ),
    ]);

    if (itemsRes.error) {
      console.error('Error fetching certifications:', itemsRes.error);
      return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 });
    }

    const items = itemsRes.data ?? [];
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
        truncated: lotsTruncated,
      },
      lots: rows,
    });
  } catch (error) {
    console.error('Error in certifications route:', error);
    return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 });
  }
}

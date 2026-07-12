import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { certStatusAtUse, evaluateDossierCompliance, type CertStatusAtUse } from '@/lib/fssc';

// GET /api/ots/[id]/dossier
// The FSSC 22000 traceability dossier ("Expediente de OT"): assembles, from data
// already captured, the full one-up/one-down record for a printed-label OT —
// the traced material lots (+ food-grade cert validity), the deliverable photo
// evidence + quality sign-off, and a compliance verdict. Read-side only; no new
// infra. Backward trace: OT → lots → supplier (+ cert).
//
// Materials come from TWO sources (2026-07 audit: receipts were invisible, so
// an OT with certified paper in bodega still read "Sin insumos trazados"):
//   * 'consumo'   — stock transactions consumed against the OT (strong tier)
//   * 'recepcion' — lots received via an OC linked to the OT (arrival tier)
type CertStatus = CertStatusAtUse;

interface MaterialRow {
  tx_id: string;
  source: 'consumo' | 'recepcion';
  quantity: number;
  unit_cost: number | null;
  consumed_at: string;
  item_name: string | null;
  item_sku: string | null;
  unit: string | null;
  cert_required: boolean;
  lot_number: string | null;
  supplier_name: string | null;
  purchase_id: string | null;
  oc_date: string | null;
  supplier_rut: string | null;
  certification_code: string | null;
  certification_expires_on: string | null;
  cert_status: CertStatus;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const [otRes, txRes, attRes, apprRes] = await Promise.all([
      supabaseAdmin
        .from('ots')
        .select('id, ot_number, client_name, status, created_at, quantity, deadline, description')
        .eq('id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('inventory_stock_transactions')
        .select('id, quantity, unit_cost, tx_type, created_at, lot:inventory_lots(lot_number, certification_code, certification_expires_on, supplier_name, purchase_id), item:inventory_items(name, sku, unit, is_certification_required)')
        .eq('work_order_id', id)
        .eq('tx_type', 'consumption'),
      supabaseAdmin
        .from('ot_attachments')
        .select('id, filename, storage_path, mime_type, created_at, uploaded_by')
        .eq('ot_id', id)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('ot_approvals')
        .select('id, status, comments, approver_id, requested_by, resolved_at, created_at')
        .eq('ot_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (otRes.error) {
      console.error('Error fetching OT for dossier:', otRes.error);
      return NextResponse.json({ error: 'Failed to fetch OT' }, { status: 500 });
    }
    if (!otRes.data) {
      return NextResponse.json({ error: 'OT not found' }, { status: 404 });
    }

    // ── Materials + per-lot cert validity at the moment of consumption ──
    const txRows = (txRes.data ?? []) as Array<{
      id: string; quantity: number; unit_cost: number | null; created_at: string;
      lot: { lot_number: string | null; certification_code: string | null; certification_expires_on: string | null; supplier_name: string | null; purchase_id: string | null } | null;
      item: { name: string | null; sku: string | null; unit: string | null; is_certification_required: boolean | null } | null;
    }>;

    // Resolve each consumed lot's purchase order (OC) → supplier RUT — the FSSC
    // one-up supply trace (lot → OC → supplier).
    const purchaseIds = Array.from(new Set(txRows.map((tx) => tx.lot?.purchase_id).filter((p): p is string => !!p)));
    const ocByPurchase = new Map<string, { date: string | null; rut: string | null }>();
    if (purchaseIds.length > 0) {
      const { data: purchases } = await supabaseAdmin
        .from('purchases')
        .select('id, purchase_date, supplier_rut')
        .in('id', purchaseIds);
      for (const p of purchases ?? []) {
        ocByPurchase.set(p.id, { date: p.purchase_date ?? null, rut: p.supplier_rut ?? null });
      }
    }

    const materials: MaterialRow[] = txRows.map((tx) => {
      const certRequired = !!tx.item?.is_certification_required;
      const code = tx.lot?.certification_code ?? null;
      const expires = tx.lot?.certification_expires_on ?? null;
      const cert_status: CertStatus = certStatusAtUse({ certRequired, code, expiresOn: expires, consumedAt: tx.created_at });
      return {
        tx_id: tx.id,
        source: 'consumo' as const,
        quantity: Number(tx.quantity ?? 0),
        unit_cost: tx.unit_cost,
        consumed_at: tx.created_at,
        item_name: tx.item?.name ?? null,
        item_sku: tx.item?.sku ?? null,
        unit: tx.item?.unit ?? null,
        cert_required: certRequired,
        lot_number: tx.lot?.lot_number ?? null,
        supplier_name: tx.lot?.supplier_name ?? null,
        purchase_id: tx.lot?.purchase_id ?? null,
        oc_date: tx.lot?.purchase_id ? (ocByPurchase.get(tx.lot.purchase_id)?.date ?? null) : null,
        supplier_rut: tx.lot?.purchase_id ? (ocByPurchase.get(tx.lot.purchase_id)?.rut ?? null) : null,
        certification_code: code,
        certification_expires_on: expires,
        cert_status,
      };
    });

    // ── Receipt tier: lots received via OCs linked to this OT ──
    // Skip lots already present as consumption rows (the stronger record wins).
    const { data: otPurchases } = await supabaseAdmin
      .from('purchases')
      .select('id, purchase_date, supplier_rut')
      .eq('ot_id', id);
    const otPurchaseList = otPurchases ?? [];
    if (otPurchaseList.length > 0) {
      const { data: receivedLots } = await supabaseAdmin
        .from('inventory_lots')
        .select('id, lot_number, quantity_received, unit_cost, received_date, supplier_name, purchase_id, certification_code, certification_expires_on, item:inventory_items(name, sku, unit, is_certification_required)')
        .in('purchase_id', otPurchaseList.map((p) => p.id));
      const consumedLotNumbers = new Set(materials.map((m) => m.lot_number).filter(Boolean));
      const purchaseById = new Map(otPurchaseList.map((p) => [p.id, p]));
      for (const lot of (receivedLots ?? []) as Array<{
        id: string; lot_number: string | null; quantity_received: number | null; unit_cost: number | null;
        received_date: string | null; supplier_name: string | null; purchase_id: string | null;
        certification_code: string | null; certification_expires_on: string | null;
        item: { name: string | null; sku: string | null; unit: string | null; is_certification_required: boolean | null } | null;
      }>) {
        if (lot.lot_number && consumedLotNumbers.has(lot.lot_number)) continue;
        const certRequired = !!lot.item?.is_certification_required;
        const receivedAt = lot.received_date ?? new Date().toISOString();
        const purchase = lot.purchase_id ? purchaseById.get(lot.purchase_id) : undefined;
        materials.push({
          tx_id: `lot-${lot.id}`,
          source: 'recepcion' as const,
          quantity: Number(lot.quantity_received ?? 0),
          unit_cost: lot.unit_cost,
          consumed_at: receivedAt,
          item_name: lot.item?.name ?? null,
          item_sku: lot.item?.sku ?? null,
          unit: lot.item?.unit ?? null,
          cert_required: certRequired,
          lot_number: lot.lot_number,
          supplier_name: lot.supplier_name,
          purchase_id: lot.purchase_id,
          oc_date: purchase?.purchase_date ?? null,
          supplier_rut: purchase?.supplier_rut ?? null,
          certification_code: lot.certification_code,
          certification_expires_on: lot.certification_expires_on,
          cert_status: certStatusAtUse({ certRequired, code: lot.certification_code, expiresOn: lot.certification_expires_on, consumedAt: receivedAt }),
        });
      }
    }

    const attachments = (attRes.data ?? []) as Array<{ id: string; filename: string; storage_path: string; mime_type: string | null; created_at: string }>;
    const approvals = (apprRes.data ?? []) as Array<{ id: string; status: string; comments: string | null; resolved_at: string | null; created_at: string }>;

    // Short-lived signed URLs for image attachments so the dossier shows thumbnails.
    const imagePaths = attachments.filter((a) => (a.mime_type ?? '').startsWith('image/')).map((a) => a.storage_path);
    const signedByPath = new Map<string, string>();
    if (imagePaths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage.from('ot-attachments').createSignedUrls(imagePaths, 600);
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
      }
    }
    const attachmentsOut = attachments.map((a) => ({ ...a, url: signedByPath.get(a.storage_path) ?? null }));

    // ── Compliance verdict ──
    const photoCount = attachments.filter((a) => (a.mime_type ?? '').startsWith('image/')).length || attachments.length;
    const hasApproval = approvals.some((a) => a.status === 'approved');
    const verdict = evaluateDossierCompliance({
      materialCertStatuses: materials.map((m) => m.cert_status),
      materialsCount: materials.length,
      attachmentsCount: attachments.length,
      hasApproval,
    });

    return NextResponse.json({
      ot: otRes.data,
      materials,
      attachments: attachmentsOut,
      approvals,
      compliance: {
        compliant: verdict.compliant,
        cert_issues: verdict.certIssues,
        materials_count: materials.length,
        photo_count: photoCount,
        has_approval: hasApproval,
        reasons: verdict.reasons,
      },
    });
  } catch (error) {
    console.error('Error in OT dossier route:', error);
    return NextResponse.json({ error: 'Failed to build dossier' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { consumptionByOt, recallSummary } from '@/lib/fssc';

// GET /api/recall
//   • no params      → list of material lots (for the recall picker)
//   • ?lot_id=<uuid> → FSSC 22000 mock-recall forward trace: this lot → every OT
//     that consumed it → the affected customers. The "one-up/one-down" impact
//     test an auditor runs ("a bad lot arrived — who got product made from it?").
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const lotId = new URL(req.url).searchParams.get('lot_id');

  try {
    // ── List mode ──
    if (!lotId) {
      const { data, error } = await supabaseAdmin
        .from('inventory_lots')
        .select('id, lot_number, supplier_name, certification_code, certification_expires_on, quantity_available, received_date, item:inventory_items(name, sku)')
        .order('received_date', { ascending: false })
        .limit(300);
      if (error) {
        console.error('Error listing lots for recall:', error);
        return NextResponse.json({ error: 'Failed to list lots' }, { status: 500 });
      }
      return NextResponse.json({ lots: data ?? [] });
    }

    // ── Trace mode ──
    const { data: lot, error: lotError } = await supabaseAdmin
      .from('inventory_lots')
      .select('id, lot_number, supplier_name, certification_code, certification_expires_on, received_date, item:inventory_items(name, sku)')
      .eq('id', lotId)
      .maybeSingle();

    if (lotError) {
      console.error('Error fetching lot for recall:', lotError);
      return NextResponse.json({ error: 'Failed to fetch lot' }, { status: 500 });
    }
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const { data: txData, error: txError } = await supabaseAdmin
      .from('inventory_stock_transactions')
      .select('work_order_id, quantity, created_at')
      .eq('lot_id', lotId)
      .eq('tx_type', 'consumption');

    if (txError) {
      console.error('Error fetching consumption for recall:', txError);
      return NextResponse.json({ error: 'Failed to trace lot' }, { status: 500 });
    }

    const txs = (txData ?? []) as Array<{ work_order_id: string | null; quantity: number; created_at: string }>;

    const consumedByOt = consumptionByOt(txs);
    const otIds = Array.from(consumedByOt.keys());

    let affectedOts: Array<{
      id: string; ot_number: string | null; client_name: string | null; status: string | null;
      created_at: string | null; quantity: number | null; consumed_quantity: number;
    }> = [];

    if (otIds.length > 0) {
      const { data: otData, error: otError } = await supabaseAdmin
        .from('ots')
        .select('id, ot_number, client_name, status, created_at, quantity')
        .in('id', otIds);
      if (otError) {
        console.error('Error fetching OTs for recall:', otError);
        return NextResponse.json({ error: 'Failed to fetch affected OTs' }, { status: 500 });
      }
      affectedOts = (otData ?? []).map((ot) => ({
        ...ot,
        consumed_quantity: consumedByOt.get(ot.id) ?? 0,
      })).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }

    const summary = recallSummary(affectedOts);

    return NextResponse.json({
      lot,
      affected_ots: affectedOts,
      customers: summary.customers,
      summary: {
        ot_count: summary.ot_count,
        customer_count: summary.customer_count,
        total_consumed: summary.total_consumed,
      },
    });
  } catch (error) {
    console.error('Error in recall route:', error);
    return NextResponse.json({ error: 'Failed to run recall' }, { status: 500 });
  }
}

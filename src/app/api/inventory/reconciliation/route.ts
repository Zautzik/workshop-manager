import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/inventory/reconciliation
//
// Lee `inventory_reconciliation_alerts` — lotes cuyo quantity_available no
// coincide con la suma de sus inventory_stock_transactions. La tabla la
// llena `reconciliar_inventario()` (pg_cron diario, o a mano si el plan de
// Supabase no trae la extensión — ver cron_status()). Esta ruta sólo la
// muestra: no recalcula nada en cada carga de pantalla.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('inventory_reconciliation_alerts' as any)
    .select('lot_id, item_id, quantity_available, quantity_ledger, drift, detected_at, inventory_lots(lot_number), inventory_items(name, sku)')
    .order('detected_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as any[]).map((r) => ({
    lot_id: r.lot_id,
    item_id: r.item_id,
    lot_number: r.inventory_lots?.lot_number ?? null,
    item_name: r.inventory_items?.name ?? null,
    item_sku: r.inventory_items?.sku ?? null,
    quantity_available: Number(r.quantity_available),
    quantity_ledger: Number(r.quantity_ledger),
    drift: Number(r.drift),
    detected_at: r.detected_at,
  }));

  return NextResponse.json({ alerts: rows, count: rows.length });
}

// POST /api/inventory/reconciliation — corre el chequeo ahora mismo, para
// cuando pg_cron no está agendado en este plan (ver cron_status()) y nadie
// quiere esperar hasta mañana para confirmar que el saldo cuadra.
export async function POST(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin.rpc('reconciliar_inventario' as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ open_alerts: data });
}

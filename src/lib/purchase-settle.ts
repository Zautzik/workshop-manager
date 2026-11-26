import { supabaseAdmin } from '@/integrations/supabase/server';
import { isSettled, type OCProgress, type OCStatus } from '@/lib/purchasing';

/**
 * An OC's state and progress, from the one reconciliation view
 * (`oc_conciliacion`: pedido / recibido / facturado) plus its invoices.
 */
export async function loadOcProgress(purchaseId: string): Promise<{
  status: OCStatus;
  progress: OCProgress;
  openInvoices: number;
} | null> {
  const [oc, conc, inv] = await Promise.all([
    supabaseAdmin.from('purchases' as any).select('status').eq('id', purchaseId).maybeSingle(),
    supabaseAdmin.from('oc_conciliacion').select('pedido, recibido, facturado').eq('id', purchaseId).maybeSingle(),
    supabaseAdmin
      .from('purchase_invoices' as any)
      .select('id', { count: 'exact', head: true })
      .eq('purchase_id', purchaseId)
      .in('status', ['received', 'disputed']),
  ]);
  if (oc.error) throw new Error(oc.error.message);
  if (conc.error) throw new Error(conc.error.message);
  if (inv.error) throw new Error(inv.error.message);
  if (!oc.data) return null;
  const c = (conc.data ?? {}) as { pedido?: number; recibido?: number; facturado?: number };
  return {
    status: (oc.data as unknown as { status: OCStatus }).status,
    progress: { ordered: Number(c.pedido ?? 0), received: Number(c.recibido ?? 0), invoiced: Number(c.facturado ?? 0) },
    openInvoices: inv.count ?? 0,
  };
}

/**
 * Close the OC if nothing is left to do (isSettled). Called after every event
 * that can complete it — a receipt, a new invoice, an invoice approved — so
 * "Cerrada" is reached the moment it is true, by one rule (audit M6).
 * Returns true when it closed the OC.
 */
export async function settlePurchase(purchaseId: string): Promise<boolean> {
  const state = await loadOcProgress(purchaseId);
  if (!state || !isSettled(state.status, state.progress, state.openInvoices)) return false;
  const { error } = await supabaseAdmin
    .from('purchases' as any)
    .update({ status: 'closed' } as any)
    .eq('id', purchaseId)
    .in('status', ['received', 'invoiced']);
  if (error) throw new Error(error.message);
  return true;
}

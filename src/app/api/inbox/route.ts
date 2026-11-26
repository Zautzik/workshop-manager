import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { ACTIVE_OT_STATUSES } from '@/lib/ot-state-machine';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';
import { plantParts } from '@/lib/plant-calendar';
import { INBOX_ITEMS, inboxKeysFor, type InboxKey } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inbox — Inicio's "what needs me today" (audit M1).
 *
 * One count per item, from the table that owns the fact; which items a role
 * sees is decided in src/lib/inbox.ts. A vendedor's OT counts are scoped to
 * their own OTs, like every other sales screen. A count that fails is reported
 * as an error for that item, never as zero.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const keys = inboxKeysFor(auth.role);
  const p = plantParts(Date.now());
  const today = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const scope = keys.some((k) => k === 'late' || k === 'signoff') ? await resolveSalesScope(auth) : null;

  const ots = () => {
    let q = supabaseAdmin.from('ots').select('id, ot_number, client_name, deadline', { count: 'exact' });
    if (scope && !scope.all) q = q.eq('salesman_id', scopeFilterId(scope));
    return q;
  };

  type Result = { count: number; sample?: string[] };
  const queries: Record<InboxKey, () => Promise<Result>> = {
    late: async () => {
      const { data, count, error } = await ots()
        .in('status', [...ACTIVE_OT_STATUSES])
        .lt('deadline', today)
        .order('deadline', { ascending: true })
        .limit(3);
      if (error) throw new Error(error.message);
      return {
        count: count ?? 0,
        sample: (data ?? []).map((o: any) => `${o.ot_number}${o.client_name ? ` · ${o.client_name}` : ''}`),
      };
    },
    signoff: async () => {
      const { data, count, error } = await ots()
        .in('status', ['pre_press', 'visto_bueno'])
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(3);
      if (error) throw new Error(error.message);
      return { count: count ?? 0, sample: (data ?? []).map((o: any) => `${o.ot_number}${o.client_name ? ` · ${o.client_name}` : ''}`) };
    },
    captures: async () => {
      const { count, error } = await supabaseAdmin.from('capture_events').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw new Error(error.message);
      return { count: count ?? 0 };
    },
    maintenance: async () => {
      const { count, error } = await supabaseAdmin
        .from('maintenance_work_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress'])
        .lt('scheduled_date', today);
      if (error) throw new Error(error.message);
      return { count: count ?? 0 };
    },
    invoice_disputes: async () => {
      const { count, error } = await supabaseAdmin
        .from('purchase_invoices' as any)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'disputed');
      if (error) throw new Error(error.message);
      return { count: count ?? 0 };
    },
    leave: async () => {
      const { count, error } = await supabaseAdmin.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw new Error(error.message);
      return { count: count ?? 0 };
    },
  };

  const settled = await Promise.allSettled(keys.map((k) => queries[k]()));
  const items = keys.map((key, i) => {
    const def = INBOX_ITEMS[key];
    const r = settled[i];
    if (r.status === 'rejected') {
      console.error(`inbox/${key}:`, r.reason);
      return { key, href: def.href, tone: def.tone, count: null, label: def.label(2), error: true };
    }
    return { key, href: def.href, tone: def.tone, count: r.value.count, label: def.label(r.value.count), sample: r.value.sample ?? [] };
  });

  return NextResponse.json({ items });
}

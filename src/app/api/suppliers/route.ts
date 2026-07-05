import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

interface Supplier {
  supplier: string;
  supplier_rut: string | null;
  supplier_giro: string | null;
  oc_count: number;
  total_spend: number;
  open_count: number;         // OCs not closed/cancelled
  last_purchase_date: string | null;
}

// GET /api/suppliers — supplier directory derived from purchases (OCs).
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('purchases' as any)
    .select('supplier, supplier_rut, supplier_giro, total_cost, purchase_date, status');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<{
    supplier: string; supplier_rut: string | null; supplier_giro: string | null;
    total_cost: number; purchase_date: string | null; status: string;
  }>;

  const byName = new Map<string, Supplier>();
  for (const r of rows) {
    const key = (r.supplier || 'Sin proveedor').trim();
    const s = byName.get(key) ?? {
      supplier: key, supplier_rut: null, supplier_giro: null,
      oc_count: 0, total_spend: 0, open_count: 0, last_purchase_date: null,
    };
    s.oc_count += 1;
    s.total_spend += Number(r.total_cost || 0);
    if (!['closed', 'cancelled'].includes(r.status)) s.open_count += 1;
    if (r.supplier_rut && !s.supplier_rut) s.supplier_rut = r.supplier_rut;
    if (r.supplier_giro && !s.supplier_giro) s.supplier_giro = r.supplier_giro;
    if (r.purchase_date && (!s.last_purchase_date || r.purchase_date > s.last_purchase_date)) {
      s.last_purchase_date = r.purchase_date;
    }
    byName.set(key, s);
  }

  const suppliers = [...byName.values()].sort((a, b) => b.total_spend - a.total_spend);
  const totals = {
    count: suppliers.length,
    spend: suppliers.reduce((a, s) => a + s.total_spend, 0),
    open: suppliers.reduce((a, s) => a + s.open_count, 0),
  };

  return NextResponse.json({ data: suppliers, totals });
}

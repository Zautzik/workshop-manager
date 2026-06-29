import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Reads the unified cost ledger roll-up (estimate vs actual vs revenue per OT)
// via supabaseAdmin so the dev bypass / RLS doesn't blank it out.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    // ot_cost_summary view isn't in the generated types yet (run `gen types`).
    .from('ot_cost_summary' as any)
    .select('*')
    .order('ot_number', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// Appends manual ACTUAL cost lines to the ledger for an OT.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const otId = body?.ot_id;
  if (!otId) return NextResponse.json({ error: 'ot_id is required' }, { status: 400 });

  const rows = (Array.isArray(body?.lines) ? body.lines : [])
    .filter((l: any) => Number(l?.unit_cost) > 0)
    .map((l: any) => ({
      ot_id: otId,
      kind: 'actual',
      category: l.category ?? 'other',
      source: 'manual',
      description: l.description || 'Costo manual',
      quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
      unit: l.unit || 'unit',
      unit_cost: Number(l.unit_cost),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No hay líneas de costo con valor' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('ot_cost_lines' as any).insert(rows as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

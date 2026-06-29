import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ROLES = ['admin', 'manager', 'supervisor', 'vendedor'] as const;

// GET /api/vistos-buenos — list quotes (Vistos Buenos).
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  // NOTE: vendedor row-scoping (salesman_id = me) needs the auth↔employee map;
  // until verified, non-admins see all. Tighten here once that mapping is known.
  const { data, error } = await supabaseAdmin
    .from('vistos_buenos' as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/vistos-buenos — create a quote (draft).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const row = {
    client_id: b.client_id ?? null,
    client_name: b.client_name ?? null,
    salesman_id: b.salesman_id ?? null,
    product_name: b.product_name ?? null,
    product_type: b.product_type ?? null,
    quantity: b.quantity ?? null,
    width_cm: b.width_cm ?? null,
    height_cm: b.height_cm ?? null,
    substrate_type: b.substrate_type ?? null,
    grammage_gsm: b.grammage_gsm ?? null,
    color_front: b.color_front ?? null,
    color_back: b.color_back ?? null,
    ink_coverage: b.ink_coverage ?? null,
    finishes: b.finishes ?? null,
    estimate_lines: b.estimate_lines ?? null,
    subtotal_cost: b.subtotal_cost ?? 0,
    margin_pct: b.margin_pct ?? 0,
    markup_pct: b.markup_pct ?? 0,
    total_price: b.total_price ?? 0,
    unit_price: b.unit_price ?? 0,
    floor_price: b.floor_price ?? 0,
    status: b.status ?? 'draft',
    notes: b.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('vistos_buenos' as any)
    .insert(row as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

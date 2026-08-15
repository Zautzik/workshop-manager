import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';

const ROLES = ['admin', 'manager', 'supervisor', 'vendedor'] as const;

// GET /api/vistos-buenos — list quotes (Vistos Buenos).
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  // Row-scoping: a vendedor sees only their own quotes (salesman_id = me);
  // ops/management roles see all. See sales-scope.ts for the auth↔employee map.
  const scope = await resolveSalesScope(auth);

  let query = supabaseAdmin
    .from('vistos_buenos' as any)
    // La cotización ya no tiene número propio: se trae el de la OT que originó,
    // que es la identidad del trabajo. `ots!vistos_buenos_ot_id_fkey` no existe —
    // el vínculo va al revés (`ots.vb_id`), así que se resuelve por esa FK.
    .select('*, ots!ots_vb_id_fkey ( ot_number )')
    .order('created_at', { ascending: false });

  if (!scope.all) {
    query = query.eq('salesman_id', scopeFilterId(scope));
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se aplana: la pantalla pide `ot_number`, no un arreglo anidado con una fila.
  return NextResponse.json({
    data: (data ?? []).map((v: any) => ({
      ...v,
      ot_number: Array.isArray(v.ots) ? v.ots[0]?.ot_number ?? null : v.ots?.ot_number ?? null,
      ots: undefined,
    })),
  });
}

// POST /api/vistos-buenos — create a quote (draft).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  // Ownership: a vendedor can only create quotes under their own name. Ops/
  // management roles may attribute the quote to any salesman (b.salesman_id).
  const scope = await resolveSalesScope(auth);
  if (!scope.all && !scope.salesmanId) {
    return NextResponse.json(
      { error: 'Tu usuario no está vinculado a un vendedor.' },
      { status: 403 }
    );
  }
  const ownerSalesmanId = scope.all ? (b.salesman_id ?? null) : scope.salesmanId;

  const row = {
    client_id: b.client_id ?? null,
    client_name: b.client_name ?? null,
    salesman_id: ownerSalesmanId,
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
    // La ruta enumera los campos, así que lo que no esté acá se descarta en
    // silencio. Estos tres llegaban desde el diálogo y se perdían: la OT nacía
    // sin fecha comprometida, en prioridad normal, y sin la prensa que decide
    // qué pliego se puede montar — el dato que más mueve el precio.
    deadline: b.deadline ?? null,
    priority_level: b.priority_level ?? 'normal',
    press_id: b.press_id ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('vistos_buenos' as any)
    .insert(row as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

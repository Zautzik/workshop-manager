import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';

const ROLES = ['admin', 'manager', 'supervisor', 'vendedor'] as const;

const EstimateLineSchema = z.object({
  category: z.string(),
  description: z.string(),
  quantity: z.coerce.number(),
  unit: z.string(),
  unit_cost: z.coerce.number(),
});

// Nada de esto cambia qué puede pasar hoy -- es la misma cotización que ya se
// guardaba. Lo que faltaba era que un número mal tipeado (p. ej. un string en
// `quantity`) o un campo corrupto llegara derecho a la base sin que nadie lo
// mirara antes: acá es donde se para.
const CreateVbSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(200).optional().nullable(),
  salesman_id: z.string().uuid().optional().nullable(),
  product_name: z.string().max(200).optional().nullable(),
  product_type: z.string().max(100).optional().nullable(),
  quantity: z.coerce.number().int().min(0).optional().nullable(),
  width_cm: z.coerce.number().min(0).optional().nullable(),
  height_cm: z.coerce.number().min(0).optional().nullable(),
  substrate_type: z.string().max(100).optional().nullable(),
  grammage_gsm: z.coerce.number().int().min(0).optional().nullable(),
  color_front: z.string().max(50).optional().nullable(),
  color_back: z.string().max(50).optional().nullable(),
  ink_coverage: z.string().max(50).optional().nullable(),
  finishes: z.record(z.string(), z.boolean()).optional().nullable(),
  estimate_lines: z.array(EstimateLineSchema).optional().nullable(),
  calc_sheets: z.coerce.number().min(0).optional().nullable(),
  calc_substrate_kg: z.coerce.number().min(0).optional().nullable(),
  calc_ink_kg: z.coerce.number().min(0).optional().nullable(),
  calc_plates: z.coerce.number().min(0).optional().nullable(),
  calc_print_hours: z.coerce.number().min(0).optional().nullable(),
  calc_finish_hours: z.coerce.number().min(0).optional().nullable(),
  subtotal_cost: z.coerce.number().min(0).default(0),
  margin_pct: z.coerce.number().default(0),
  markup_pct: z.coerce.number().default(0),
  total_price: z.coerce.number().min(0).default(0),
  unit_price: z.coerce.number().min(0).default(0),
  floor_price: z.coerce.number().min(0).default(0),
  status: z.enum(['draft', 'sent', 'signed', 'converted', 'rejected', 'expired']).default('draft'),
  notes: z.string().max(2000).optional().nullable(),
  deadline: z.string().optional().nullable(),
  priority_level: z.string().max(50).optional().default('normal'),
  press_id: z.string().uuid().optional().nullable(),
});

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

  const raw = await req.json().catch(() => null);
  if (!raw) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const parsed = CreateVbSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const b = parsed.data;

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
    // Lo que el motor ya calculó en el diálogo -- pliegos, kilos, planchas,
    // horas -- viaja con la cotización en vez de perderse. convert_vb_to_ot()
    // los copia a la OT; antes nacía con los seis en null (auditoría
    // 2026-09-01, hallazgo F-2).
    calc_sheets: b.calc_sheets ?? null,
    calc_substrate_kg: b.calc_substrate_kg ?? null,
    calc_ink_kg: b.calc_ink_kg ?? null,
    calc_plates: b.calc_plates ?? null,
    calc_print_hours: b.calc_print_hours ?? null,
    calc_finish_hours: b.calc_finish_hours ?? null,
    subtotal_cost: b.subtotal_cost,
    margin_pct: b.margin_pct,
    markup_pct: b.markup_pct,
    total_price: b.total_price,
    unit_price: b.unit_price,
    floor_price: b.floor_price,
    status: b.status,
    notes: b.notes ?? null,
    // La ruta enumera los campos, así que lo que no esté acá se descarta en
    // silencio. Estos tres llegaban desde el diálogo y se perdían: la OT nacía
    // sin fecha comprometida, en prioridad normal, y sin la prensa que decide
    // qué pliego se puede montar — el dato que más mueve el precio.
    deadline: b.deadline ?? null,
    priority_level: b.priority_level,
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

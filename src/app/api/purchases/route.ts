import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// OCs drive live cost; never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

/**
 * GET /api/purchases — las OC con su conciliación.
 *
 * Sirve `oc_conciliacion` y no `oc_billing`: la vista vieja compara lo pedido
 * contra lo facturado y se salta lo que efectivamente llegó, que es justo
 * donde se pierde plata —recibir 480 y que te facturen 500—. La nueva trae las
 * dos brechas separadas, porque una la resuelve bodega y la otra cuentas por
 * pagar, y sumarlas puede dar cero teniendo los dos problemas.
 *
 * `?ot_id=` filtra las de una orden: es como llega desde el Kanban.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  let q = supabaseAdmin.from('oc_conciliacion' as any).select('*');

  const otId = req.nextUrl.searchParams.get('ot_id');
  if (otId) q = q.eq('ot_id', otId);

  const { data, error } = await q.order('issued_at', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateOCSchema = z.object({
  supplier: z.string().min(1).max(255),
  supplier_rut: z.string().max(50).optional().nullable(),
  ot_id: z.string().uuid().optional().nullable(),
  total_cost: z.coerce.number().min(0).default(0),
  status: z.enum(['draft', 'sent', 'received', 'invoiced', 'closed', 'cancelled']).default('draft'),
  purchase_date: z.string().optional(),
  expected_date: z.string().optional().nullable(),
  certification_details: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/purchases — create an OC and feed it into the cost ledger.
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateOCSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('purchases' as any)
    .insert({
      supplier: d.supplier,
      supplier_rut: d.supplier_rut ?? null,
      ot_id: d.ot_id ?? null,
      total_cost: d.total_cost,
      status: d.status,
      purchase_date: d.purchase_date ?? new Date().toISOString().slice(0, 10),
      expected_date: d.expected_date ?? null,
      certification_details: d.certification_details ?? null,
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Feed the new OC into the unified ledger (committed cost on the linked OT).
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: (data as any).id });

  return NextResponse.json({ data }, { status: 201 });
}

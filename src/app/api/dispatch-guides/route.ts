import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/dispatch-guides[?ot_id=] — guías de despacho.
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const otId = new URL(req.url).searchParams.get('ot_id');
  let query = supabaseAdmin
    .from('dispatch_guides' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (otId) query = query.eq('ot_id', otId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateGuideSchema = z.object({
  ot_id: z.string().uuid(),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(255).optional().nullable(),
  quantity: z.coerce.number().int().min(1),
  dispatch_date: z.string().optional(),
  carrier: z.string().max(255).optional().nullable(),
  vehicle_plate: z.string().max(50).optional().nullable(),
  received_by: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/dispatch-guides — create a (possibly partial) shipment of an OT.
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateGuideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('dispatch_guides' as any)
    .insert({
      ot_id: d.ot_id,
      client_id: d.client_id ?? null,
      client_name: d.client_name ?? null,
      quantity: d.quantity,
      dispatch_date: d.dispatch_date ?? new Date().toISOString().slice(0, 10),
      carrier: d.carrier ?? null,
      vehicle_plate: d.vehicle_plate ?? null,
      received_by: d.received_by ?? null,
      status: 'dispatched',
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

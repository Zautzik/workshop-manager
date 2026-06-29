import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;
const IVA_RATE = 0.19; // Chile

// GET /api/sales-invoices[?ot_id=] — facturas de venta.
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const otId = new URL(req.url).searchParams.get('ot_id');
  let query = supabaseAdmin
    .from('sales_invoices' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (otId) query = query.eq('ot_id', otId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateInvoiceSchema = z.object({
  ot_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(255).optional().nullable(),
  net_amount: z.coerce.number().min(0),
  due_date: z.string().optional().nullable(),
  guide_ids: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/sales-invoices — issue a factura de venta (IVA 19%) and bill the
// given guías de despacho (sets their invoice_id).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // CLP shows no cents → round the IVA and total to whole pesos.
  const net = Math.round(d.net_amount);
  const tax = Math.round(net * IVA_RATE);
  const total = net + tax;

  const { data, error } = await supabaseAdmin
    .from('sales_invoices' as any)
    .insert({
      ot_id: d.ot_id ?? null,
      client_id: d.client_id ?? null,
      client_name: d.client_name ?? null,
      net_amount: net,
      tax_amount: tax,
      total_amount: total,
      status: 'issued',
      due_date: d.due_date ?? null,
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bill the selected guías onto this invoice.
  if (d.guide_ids.length > 0) {
    await supabaseAdmin
      .from('dispatch_guides' as any)
      .update({ invoice_id: (data as any).id } as any)
      .in('id', d.guide_ids);
  }

  return NextResponse.json({ data }, { status: 201 });
}

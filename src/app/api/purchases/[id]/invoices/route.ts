import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/purchases/[id]/invoices — facturas de compra for an OC.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .select('*')
    .eq('purchase_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateFacturaSchema = z.object({
  invoice_number: z.string().min(1).max(100),
  amount: z.coerce.number().min(0),
  invoice_date: z.string().optional(),
  status: z.enum(['received', 'matched', 'disputed', 'paid']).default('received'),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/purchases/[id]/invoices — register a factura against an OC.
// If it lands matched/paid, the OC's ledger line flips committed → actual.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateFacturaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const matched = d.status === 'matched' || d.status === 'paid';

  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .insert({
      purchase_id: id,
      invoice_number: d.invoice_number,
      amount: d.amount,
      invoice_date: d.invoice_date ?? new Date().toISOString().slice(0, 10),
      status: d.status,
      matched_at: matched ? new Date().toISOString() : null,
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Receiving a factura advances the OC to 'invoiced'; re-derive the ledger.
  await supabaseAdmin.from('purchases' as any).update({ status: 'invoiced' } as any).eq('id', id);
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: id });

  return NextResponse.json({ data }, { status: 201 });
}

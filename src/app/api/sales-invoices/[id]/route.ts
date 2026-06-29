import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const UpdateInvoiceSchema = z.object({
  status: z.enum(['issued', 'sent', 'paid', 'cancelled']).optional(),
  paid_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// PATCH /api/sales-invoices/[id] — advance a factura (sent / paid / cancelled).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  // Stamp the payment date when marked paid (unless one was supplied).
  if (parsed.data.status === 'paid' && parsed.data.paid_date === undefined) {
    patch.paid_date = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabaseAdmin
    .from('sales_invoices' as any)
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/sales-invoices/[id] — remove a factura (unlinks its guías via FK).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { error } = await supabaseAdmin.from('sales_invoices' as any).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

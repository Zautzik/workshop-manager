import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const UpdateFacturaSchema = z.object({
  invoice_number: z.string().min(1).max(100).optional(),
  amount: z.coerce.number().min(0).optional(),
  invoice_date: z.string().optional(),
  status: z.enum(['received', 'matched', 'disputed', 'paid']).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// PATCH /api/purchases/[id]/invoices/[invoiceId] — match / pay / dispute a
// factura. Crossing into matched/paid flips the OC's ledger line to actual.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id, invoiceId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateFacturaSchema.safeParse(body);
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
  // Stamp matched_at when the factura is reconciled.
  if (parsed.data.status === 'matched' || parsed.data.status === 'paid') {
    patch.matched_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('purchase_invoices' as any)
    .update(patch as any)
    .eq('id', invoiceId)
    .eq('purchase_id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Re-derive the OC's ledger line (committed ↔ actual).
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: id });

  return NextResponse.json({ data });
}

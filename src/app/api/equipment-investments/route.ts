import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Equipment investment proposals (capex pipeline). Was browser-direct from
 * EquipmentInvestmentAnalysis — silently rejected by RLS under dev-bypass.
 */
const InvestmentSchema = z.object({
  equipment_name: z.string().min(1).max(255),
  machine_id: z.string().uuid().nullable().optional(),
  purchase_cost: z.coerce.number().min(0),
  estimated_annual_savings: z.coerce.number().min(0).nullable().optional(),
  status: z.enum(['proposal', 'approved', 'rejected', 'purchased']).default('proposal'),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = InvestmentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la inversión', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('equipment_investments')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo agregar la inversión' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de inversión válido' }, { status: 400 });
  }

  try {
    const parsed = InvestmentSchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la inversión', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('equipment_investments')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la inversión' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Monthly cost sheet per machine — the raw material for the machine's real
 * hourly rate. Was browser-direct from MachineCostAnalysis.
 */
const CostFields = {
  energy_cost: z.coerce.number().min(0).nullable().optional(),
  labor_cost: z.coerce.number().min(0).nullable().optional(),
  maintenance_cost: z.coerce.number().min(0).nullable().optional(),
  spare_parts_cost: z.coerce.number().min(0).nullable().optional(),
  outsourcing_cost: z.coerce.number().min(0).nullable().optional(),
  revenue_generated: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

const CreateSchema = z.object({
  machine_id: z.string().uuid(),
  // Stored as a date: the first of the month.
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
  ...CostFields,
});

const UpdateSchema = z.object(CostFields);

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de costos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_costs')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una hoja de costos para esa máquina en ese mes.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudieron agregar los costos' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de costos válido' }, { status: 400 });
  }

  try {
    const parsed = UpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de costos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_costs')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudieron actualizar los costos' }, { status: 500 });
  }
}

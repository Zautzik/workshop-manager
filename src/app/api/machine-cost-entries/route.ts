import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Per-machine monthly cost entries (energy, supplies, maintenance) recorded from
 * the machine profile. Feeds the machine's real hourly rate.
 */
const EntrySchema = z.object({
  machine_id: z.string().uuid(),
  period_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
  energy_cost: z.coerce.number().min(0).nullable().optional(),
  energy_kwh: z.coerce.number().min(0).nullable().optional(),
  supplies_cost: z.coerce.number().min(0).nullable().optional(),
  maintenance_cost: z.coerce.number().min(0).nullable().optional(),
  other_cost: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** POST — upsert by `id`: present means update, absent means create. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const body = await req.json();
    const { id, ...rest } = body ?? {};

    if (id) {
      const parsed = EntrySchema.partial().safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Datos inválidos del costo', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('machine_cost_entries')
        .update(parsed.data)
        .eq('id', id)
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    const parsed = EntrySchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del costo', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_cost_entries')
      .insert({ ...parsed.data, recorded_by: userId })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe un registro de costos para esa máquina en ese mes.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudieron guardar los costos' }, { status: 500 });
  }
}

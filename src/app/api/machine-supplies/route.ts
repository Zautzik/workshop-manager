import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/** What a machine consumes, and how fast — used for stock forecasting. */
const SupplySchema = z.object({
  machine_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  consumption_rate: z.coerce.number().min(0),
  rate_unit: z.string().min(1).max(50),
  is_critical: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/machine-supplies?machine_id=…
 *
 * Faltaba: la tabla sólo se podía escribir y borrar, nunca leer por API — se
 * leía directo desde el navegador en la ficha de la máquina. Con la puerta
 * única de escritura ya cerrada, la de lectura también corresponde.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const machineId = new URL(req.url).searchParams.get('machine_id');
  if (!machineId || !z.string().uuid().safeParse(machineId).success) {
    return NextResponse.json({ error: 'Se requiere machine_id' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('machine_supply_requirements')
    .select('*, inventory_items ( id, name, unit, sku )')
    .eq('machine_id', machineId)
    // Lo crítico primero: es lo que detiene la máquina si falta.
    .order('is_critical', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { id, ...rest } = body ?? {};

    if (id) {
      const parsed = SupplySchema.partial().safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Datos inválidos del insumo', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('machine_supply_requirements')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    const parsed = SupplySchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del insumo', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_supply_requirements')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el insumo' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de insumo válido' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('machine_supply_requirements')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

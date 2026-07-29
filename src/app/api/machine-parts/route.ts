import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  evaluatePart,
  suggestedMinStock,
  comparePartUrgency,
  type PartCriticality,
} from '@/lib/part-procurement';

export const dynamic = 'force-dynamic';

const CRITICALITIES = ['critica', 'alta', 'media', 'baja'] as const;

const PartSchema = z.object({
  machine_id: z.string().uuid(),
  system_id: z.string().uuid(),
  name: z.string().min(2).max(160),
  part_number: z.string().max(80).nullable().optional(),
  position: z.string().max(120).nullable().optional(),
  quantity_installed: z.coerce.number().min(0).optional(),
  inventory_item_id: z.string().uuid().nullable().optional(),
  criticality: z.enum(CRITICALITIES).optional(),
  lead_time_days: z.coerce.number().int().min(0).max(730).nullable().optional(),
  preferred_supplier: z.string().max(160).nullable().optional(),
  supplier_part_ref: z.string().max(120).nullable().optional(),
  min_stock: z.coerce.number().min(0).optional(),
  unit_cost: z.coerce.number().min(0).nullable().optional(),
  is_imported: z.boolean().optional(),
  expected_life_usage: z.coerce.number().min(0).nullable().optional(),
  last_replaced_at: z.string().datetime().nullable().optional(),
  last_replaced_usage: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/machine-parts?machine_id=…
 *
 * Devuelve las piezas agrupadas por sistema, cada una ya evaluada: cuánta vida
 * le queda, en cuántos días se agota al ritmo real de esa máquina, y si el
 * plazo del proveedor todavía alcanza. La aritmética vive en part-procurement,
 * que está testeado; acá sólo se juntan los datos.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const machineId = searchParams.get('machine_id');
  const onlyUrgent = searchParams.get('urgent') === '1';

  let query = supabaseAdmin
    .from('machine_parts')
    .select(`
      *,
      machine_systems ( id, code, name, sort_order ),
      machines ( id, name, type, usage_unit, usage_counter ),
      inventory_items ( id, sku, name, unit, min_stock )
    `)
    .eq('is_active', true);

  if (machineId) query = query.eq('machine_id', machineId);

  const { data: parts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ritmo de consumo por máquina — sin esto no hay fecha, sólo porcentaje.
  const { data: rates } = await supabaseAdmin.from('machine_usage_rate_v').select('*');
  const rateByMachine = new Map(
    (rates ?? []).map((r) => [r.machine_id as string, r.uso_por_dia as number | null])
  );

  // Stock real: vive en el inventario, no acá.
  const itemIds = (parts ?? [])
    .map((p) => p.inventory_item_id)
    .filter((v): v is string => !!v);
  const stockByItem = new Map<string, number>();
  if (itemIds.length) {
    const { data: stock } = await supabaseAdmin
      .from('inventory_items_stock_v')
      .select('id, current_stock')
      .in('id', itemIds);
    for (const s of stock ?? []) {
      if (s.id) stockByItem.set(s.id, Number(s.current_stock ?? 0));
    }
  }

  const evaluated = (parts ?? []).map((p) => {
    const machine = p.machines as { usage_counter: number | null; usage_unit: string } | null;
    const usagePerDay = rateByMachine.get(p.machine_id) ?? null;

    const input = {
      usageCounter: Number(machine?.usage_counter ?? 0),
      lastReplacedUsage: p.last_replaced_usage,
      expectedLifeUsage: p.expected_life_usage,
      usagePerDay,
      leadTimeDays: p.lead_time_days,
      criticality: (p.criticality ?? 'media') as PartCriticality,
      isImported: p.is_imported ?? false,
    };

    return {
      ...p,
      usage_unit: machine?.usage_unit ?? 'hours',
      current_stock: p.inventory_item_id ? stockByItem.get(p.inventory_item_id) ?? 0 : null,
      health: evaluatePart(input),
      suggested_min_stock: suggestedMinStock({
        ...input,
        quantityInstalled: Number(p.quantity_installed ?? 1),
      }),
    };
  });

  evaluated.sort((a, b) => comparePartUrgency(a.health, b.health));

  const filtered = onlyUrgent
    ? evaluated.filter((p) => ['vencida', 'atrasado', 'pedir_ahora'].includes(p.health.status))
    : evaluated;

  return NextResponse.json({
    parts: filtered,
    summary: {
      total: evaluated.length,
      vencidas: evaluated.filter((p) => p.health.status === 'vencida').length,
      atrasadas: evaluated.filter((p) => p.health.status === 'atrasado').length,
      por_pedir: evaluated.filter((p) => p.health.status === 'pedir_ahora').length,
      sin_datos: evaluated.filter((p) => p.health.status === 'sin_datos').length,
      // Sin ritmo, todo lo de arriba es porcentaje sin fecha. Que se note.
      sin_ritmo: machineId ? rateByMachine.get(machineId) == null : undefined,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { id, ...rest } = body ?? {};

    if (id) {
      const parsed = PartSchema.partial().safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Datos inválidos de la pieza', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const { data, error } = await supabaseAdmin
        .from('machine_parts')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    const parsed = PartSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la pieza', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_parts')
      .insert(parsed.data)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar la pieza' }, { status: 500 });
  }
}

/**
 * PATCH — registrar el cambio de una pieza.
 * Deja el contador de la máquina como línea base nueva: es lo que hace que la
 * próxima estimación de vida útil parta de la realidad y no de cero.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  try {
    const { id, notes } = (await req.json()) ?? {};
    if (!id || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Se requiere el ID de la pieza' }, { status: 400 });
    }

    const { data: part, error: readErr } = await supabaseAdmin
      .from('machine_parts')
      .select('id, machine_id, machines ( usage_counter )')
      .eq('id', id)
      .single();
    if (readErr || !part) {
      return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });
    }

    const counter = Number(
      (part.machines as { usage_counter: number | null } | null)?.usage_counter ?? 0
    );

    const { data, error } = await supabaseAdmin
      .from('machine_parts')
      .update({
        last_replaced_at: new Date().toISOString(),
        last_replaced_usage: counter,
        notes: notes ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar el cambio' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de pieza válido' }, { status: 400 });
  }

  // Baja lógica: el historial de una pieza es parte del historial de la máquina.
  const { error } = await supabaseAdmin
    .from('machine_parts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Inventory item CRUD. These writes used to run browser-direct from
 * InventoryManagement, which meant RLS silently rejected them under dev-bypass
 * and nothing was logged or role-gated (2026-07 audit).
 */
const ItemSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  category: z.enum(['tool', 'supply', 'product_input', 'spare_part']),
  unit: z.string().min(1).max(50),
  min_stock: z.coerce.number().min(0).default(0),
  estimated_unit_cost: z.coerce.number().min(0).default(0),
  is_certification_required: z.boolean().default(false),
  is_active: z.boolean().default(true),
  barcode_value: z.string().max(255).nullable().optional(),
  qr_value: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ItemSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del ítem', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      // Unique SKU collision → say which one, don't 500 opaquely.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `El SKU "${parsed.data.sku}" ya existe. Usa otro.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear el ítem' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de ítem válido' }, { status: 400 });
  }

  try {
    const parsed = ItemSchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del ítem', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ese SKU ya está en uso por otro ítem.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el ítem' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de ítem válido' }, { status: 400 });
  }

  // Refuse to orphan traceability: an item with lots is history, not garbage.
  const { count } = await supabaseAdmin
    .from('inventory_lots')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Este ítem tiene ${count} lote(s) registrados y no puede eliminarse. Desactívalo en su lugar.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.from('inventory_items').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

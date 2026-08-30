import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseInventoryWorkbook } from '@/lib/inventory-import';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024;

/**
 * Ítems nuevos: se crean con un lote de apertura si el Excel reporta stock —
 * un ítem en cero no necesita un lote vacío (mismo criterio que "nunca
 * recibido" en el resto de la pantalla). Ítems que ya existen (mismo SKU):
 * sólo se actualizan nombre/clasificación/mínimo/costo — el stock NUNCA se
 * toca acá. Ajustar una cantidad ya existente requiere elegir A QUÉ lote
 * aplicar la diferencia, y eso es una decisión de alguien que mira bodega,
 * no algo que este importador deba adivinar en silencio.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Se requiere un archivo' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo supera los 10 MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseInventoryWorkbook(buffer);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se pudo leer el archivo' },
        { status: 400 }
      );
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('inventory_items')
      .select('id, sku, name, category, material_kind, min_stock, estimated_unit_cost');
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    const existingBySku = new Map((existing ?? []).map((i: any) => [i.sku, i]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: string[] = [];
    const importedAt = new Date().toISOString().slice(0, 10);

    for (const row of parsed.rows) {
      const match = existingBySku.get(row.sku);

      if (!match) {
        const { data: newItem, error: insertErr } = await supabaseAdmin
          .from('inventory_items')
          .insert({
            sku: row.sku,
            name: row.name,
            category: row.category,
            material_kind: row.materialKind,
            unit: row.unit,
            min_stock: row.minStock,
            estimated_unit_cost: row.unitCost,
            is_active: true,
            notes: `Importado desde Excel (${row.familiaOriginal} / ${row.categoriaOriginal}), período reportado ${row.periodo || 'desconocido'}.`,
          })
          .select('id')
          .single();

        if (insertErr || !newItem) {
          errors.push(`${row.sku} (${row.name}): no se pudo crear — ${insertErr?.message ?? 'error desconocido'}`);
          continue;
        }

        created++;

        if (row.excelStock > 0) {
          const lotNumber = `MIGRACION-${row.sku}-${(row.periodo || importedAt).replace(/-/g, '')}`;
          const { data: lot, error: lotErr } = await supabaseAdmin
            .from('inventory_lots')
            .insert({
              item_id: newItem.id,
              lot_number: lotNumber,
              quantity_received: row.excelStock,
              quantity_available: 0,
              unit_cost: row.unitCost,
              received_date: importedAt,
              supplier_name: 'Migración Excel',
            })
            .select('id')
            .single();

          if (lotErr || !lot) {
            errors.push(`${row.sku}: ítem creado pero el lote de apertura falló — ${lotErr?.message ?? 'error desconocido'}`);
            continue;
          }

          const { error: txErr } = await supabaseAdmin.from('inventory_stock_transactions').insert({
            item_id: newItem.id,
            lot_id: lot.id,
            tx_type: 'purchase',
            quantity: row.excelStock,
            unit_cost: row.unitCost,
            reference_code: `IMPORT-${row.sku}`,
            notes: `Saldo inicial importado desde Excel — período reportado ${row.periodo || 'desconocido'}.`,
          });

          if (txErr) {
            errors.push(`${row.sku}: lote creado pero el saldo inicial no quedó registrado — ${txErr.message}`);
          }
        }
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (match.name !== row.name) patch.name = row.name;
      if (match.category !== row.category) patch.category = row.category;
      if ((match.material_kind ?? null) !== row.materialKind) patch.material_kind = row.materialKind;
      if (Number(match.min_stock) !== row.minStock) patch.min_stock = row.minStock;
      if (Math.abs(Number(match.estimated_unit_cost) - row.unitCost) > 0.01) patch.estimated_unit_cost = row.unitCost;

      if (Object.keys(patch).length === 0) {
        unchanged++;
        continue;
      }

      const { error: updateErr } = await supabaseAdmin.from('inventory_items').update(patch).eq('id', match.id);
      if (updateErr) {
        errors.push(`${row.sku} (${row.name}): no se pudo actualizar — ${updateErr.message}`);
        continue;
      }
      updated++;
    }

    return NextResponse.json({
      sheetName: parsed.sheetName,
      warnings: parsed.warnings,
      created,
      updated,
      unchanged,
      errors,
      total: parsed.rows.length,
    });
  } catch (error) {
    console.error('Error committing inventory import:', error);
    return NextResponse.json({ error: 'No se pudo completar la importación' }, { status: 500 });
  }
}

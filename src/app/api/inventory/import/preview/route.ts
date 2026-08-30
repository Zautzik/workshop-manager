import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseInventoryWorkbook, type ParsedInventoryRow } from '@/lib/inventory-import';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024;

export interface PreviewRow extends ParsedInventoryRow {
  status: 'new' | 'updated' | 'unchanged';
  changes: string[];
  currentStock: number | null;
  stockDiffers: boolean;
}

/**
 * Sólo lee — nada se escribe acá. El commit vuelve a parsear el mismo
 * archivo en vez de confiar en lo que el cliente devuelva ya "revisado":
 * para una carga masiva de 300+ ítems, la fuente de verdad es el Excel, no
 * un JSON que pasó por el navegador.
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
      .from('inventory_items_stock_v')
      .select('sku, name, category, material_kind, min_stock, estimated_unit_cost, current_stock');
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    const existingBySku = new Map((existing ?? []).map((i: any) => [i.sku, i]));

    const rows: PreviewRow[] = parsed.rows.map((row) => {
      const match = existingBySku.get(row.sku);
      if (!match) {
        return { ...row, status: 'new', changes: [], currentStock: null, stockDiffers: false };
      }

      const changes: string[] = [];
      if (match.name !== row.name) changes.push('nombre');
      if (match.category !== row.category) changes.push('categoría');
      if ((match.material_kind ?? null) !== row.materialKind) changes.push('familia de material');
      if (Number(match.min_stock) !== row.minStock) changes.push('mínimo');
      if (Math.abs(Number(match.estimated_unit_cost) - row.unitCost) > 0.01) changes.push('costo');

      const currentStock = Number(match.current_stock ?? 0);
      const stockDiffers = Math.abs(currentStock - row.excelStock) > 0.001;

      return {
        ...row,
        status: changes.length > 0 ? 'updated' : 'unchanged',
        changes,
        currentStock,
        stockDiffers,
      };
    });

    const summary = {
      new: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'updated').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      stockDiffers: rows.filter((r) => r.stockDiffers).length,
    };

    return NextResponse.json({ sheetName: parsed.sheetName, warnings: parsed.warnings, summary, rows });
  } catch (error) {
    console.error('Error previewing inventory import:', error);
    return NextResponse.json({ error: 'No se pudo previsualizar el archivo' }, { status: 500 });
  }
}

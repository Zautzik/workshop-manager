import { NextRequest, NextResponse } from 'next/server';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { groupedCandidates, type StockPaper } from '@/lib/paper-substitution';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventory/similar — ¿qué tenemos en bodega que sirva para esto?
 *
 * La pregunta que el vendedor no puede hacerse mientras cotiza, porque
 * contestarla significaba caminar hasta bodega y revisar a ojo. Un dato que
 * cuesta una caminata es un dato que no se consulta, así que se compra papel
 * nuevo teniendo cuatro mil pliegos parados a veinte metros.
 *
 * El rol incluye `vendedor` a propósito: si el vendedor no puede consultarlo
 * mientras habla con el cliente, la funcionalidad no existe.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const q = req.nextUrl.searchParams;
  const substrate = q.get('substrate');
  const grammage = Number(q.get('grammage'));
  const sheets = Number(q.get('sheets')) || 1;

  if (!substrate || !(grammage > 0)) {
    return NextResponse.json({ error: 'Faltan sustrato y gramaje' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('inventory_lots')
    .select(
      'id, lot_number, quantity_available, received_date, unit_cost, ' +
      'inventory_items!inner ( id, name, grammage_gsm, sheet_width_cm, sheet_height_cm, category, is_certification_required ), ' +
      'certification_expires_on'
    )
    .gt('quantity_available', 0)
    // Sin retención: un lote en cuarentena no se le ofrece a nadie.
    .is('blocked_reason', null)
    .limit(400);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stock: StockPaper[] = ((data ?? []) as unknown as Record<string, any>[])
    .filter((l) => l.inventory_items?.category === 'product_input')
    .map((l) => ({
      itemId: String(l.inventory_items.id),
      itemName: String(l.inventory_items.name),
      grammageGsm: l.inventory_items.grammage_gsm == null ? null : Number(l.inventory_items.grammage_gsm),
      sheetWidthCm: l.inventory_items.sheet_width_cm == null ? null : Number(l.inventory_items.sheet_width_cm),
      sheetHeightCm: l.inventory_items.sheet_height_cm == null ? null : Number(l.inventory_items.sheet_height_cm),
      lotId: String(l.id),
      lotNumber: String(l.lot_number),
      quantityAvailable: Number(l.quantity_available),
      receivedDate: l.received_date ?? null,
      unitCost: l.unit_cost == null ? null : Number(l.unit_cost),
      // Sin esto la sugerencia ofrecía papel que `consumir_lote` rechaza.
      requiresCert: !!l.inventory_items.is_certification_required,
      certificationExpiresOn: l.certification_expires_on ?? null,
    }));

  // Agrupado por material: el vendedor elige papel, no lotes. Qué lote sale se
  // decide después en Compras, que es donde la trazabilidad importa.
  const sugeridos = groupedCandidates(stock, {
    substrateType: substrate,
    grammageGsm: grammage,
    sheetsNeeded: sheets,
    widthCm: Number(q.get('width')) || null,
    heightCm: Number(q.get('height')) || null,
    // Decide si bajar el gramaje se puede ofrecer al teléfono o lo tiene que
    // firmar producción. Olvidarlo dejaba la regla escrita y sin efecto: la
    // advertencia no aparecía nunca porque el dato no llegaba.
    productType: q.get('productType'),
  });

  return NextResponse.json({
    sugeridos: sugeridos.slice(0, 5),
    revisados: stock.length,
  });
}

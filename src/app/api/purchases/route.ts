import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// OCs drive live cost; never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

/**
 * GET /api/purchases — las OC con su conciliación.
 *
 * Sirve `oc_conciliacion` y no `oc_billing`: la vista vieja compara lo pedido
 * contra lo facturado y se salta lo que efectivamente llegó, que es justo
 * donde se pierde plata —recibir 480 y que te facturen 500—. La nueva trae las
 * dos brechas separadas, porque una la resuelve bodega y la otra cuentas por
 * pagar, y sumarlas puede dar cero teniendo los dos problemas.
 *
 * `?ot_id=` filtra las de una orden: es como llega desde el Kanban.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  let q = supabaseAdmin.from('oc_conciliacion' as any).select('*');

  const otId = req.nextUrl.searchParams.get('ot_id');
  if (otId) q = q.eq('ot_id', otId);

  const { data, error } = await q.order('issued_at', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const OCLineSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(255).optional().nullable(),
});

const CreateOCSchema = z.object({
  supplier: z.string().min(1).max(255),
  supplier_rut: z.string().max(50).optional().nullable(),
  ot_id: z.string().uuid().optional().nullable(),
  // Sostenido para una OC sin líneas (gasto genérico, sin ítem de inventario
  // que citar). Cuando `items` trae algo, el total se deriva de las líneas —
  // ver más abajo — y este valor se ignora, para no tener dos fuentes de la
  // misma plata.
  total_cost: z.coerce.number().min(0).default(0),
  // Nace SIEMPRE en borrador. El esquema aceptaba las seis fases de vida de
  // una OC ('sent'|'received'|...), pero la base exige `oc_number`,
  // `issued_by` e `issued_at` en cuanto el estado no es 'draft'
  // (`purchases_emitida_esta_completa`), y esta ruta nunca los completaba: un
  // 500 garantizado en las cinco variantes distintas de 'draft', encontrado en
  // vivo (auditoría 2026-08-30). Emitir es POST /api/purchases/[id]/issue, que
  // sí llena los tres campos dentro de la misma transacción que numera la OC.
  status: z.literal('draft').default('draft').optional(),
  purchase_date: z.string().optional(),
  expected_date: z.string().optional().nullable(),
  certification_details: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(OCLineSchema).max(100).optional(),
});

// POST /api/purchases — create an OC and feed it into the cost ledger.
//
// `items` es opcional a propósito: una OC de gasto genérico (flete, servicio)
// no cita un ítem de inventory_items y sigue entrando por `total_cost`. Pero
// cuando SÍ hay líneas, el total de la OC es la suma de lo pedido — nunca lo
// que alguien haya tipeado en el campo "Total" — porque esas son dos fuentes
// de la misma plata y ya se sabe qué pasa cuando eso ocurre (ver NOTES.md).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateOCSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const hasItems = (d.items?.length ?? 0) > 0;
  const totalFromItems = hasItems
    ? d.items!.reduce((sum, it) => sum + it.quantity * (it.unit_cost ?? 0), 0)
    : null;

  const { data, error } = await supabaseAdmin
    .from('purchases' as any)
    .insert({
      supplier: d.supplier,
      supplier_rut: d.supplier_rut ?? null,
      ot_id: d.ot_id ?? null,
      total_cost: totalFromItems ?? d.total_cost,
      status: 'draft',
      purchase_date: d.purchase_date ?? new Date().toISOString().slice(0, 10),
      expected_date: d.expected_date ?? null,
      certification_details: d.certification_details ?? null,
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) {
    // Traducido por si algo más adelante vuelve a pedir un estado que no sea
    // 'draft' acá: el nombre crudo de la restricción no le dice nada a nadie.
    const humano = /purchases_emitida_esta_completa/.test(error.message)
      ? 'Una OC nace en borrador; para emitirla con número, usá POST /api/purchases/{id}/issue.'
      : error.message;
    return NextResponse.json({ error: humano }, { status: 500 });
  }
  const purchaseId = (data as any).id as string;

  if (hasItems) {
    const { error: itemsError } = await supabaseAdmin.from('purchase_items').insert(
      d.items!.map((it) => ({
        purchase_id: purchaseId,
        item_id: it.item_id,
        quantity: it.quantity,
        unit_cost: it.unit_cost ?? null,
        description: it.description ?? null,
      })),
    );

    // Sin transacción multi-tabla vía PostgREST: si las líneas fallan, un
    // encabezado sin líneas cuando se pidieron líneas es peor que nada —
    // alguien lo daría por una OC real de $0. Se revierte el encabezado.
    if (itemsError) {
      await supabaseAdmin.from('purchases' as any).delete().eq('id', purchaseId);
      return NextResponse.json(
        { error: `No se pudieron guardar las líneas: ${itemsError.message}` },
        { status: 400 },
      );
    }
  }

  // Feed the new OC into the unified ledger (committed cost on the linked OT).
  await supabaseAdmin.rpc('sync_purchase_ledger' as any, { p_purchase_id: purchaseId });

  return NextResponse.json({ data }, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { evaluatePart, suggestedMinStock, type PartCriticality } from '@/lib/part-procurement';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  part_ids: z.array(z.string().uuid()).min(1).max(50),
  /** Sobrescribe la cantidad sugerida, pieza por pieza. */
  quantities: z.record(z.string(), z.coerce.number().min(0)).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * POST /api/machine-parts/purchase-request
 *
 * Convierte "hay que pedir esta pieza" en una orden de compra de verdad. Hasta
 * ahora Mecánica sabía calcular que una mantilla se agota antes de que llegue
 * el repuesto, y ahí se terminaba: el aviso no tenía a dónde ir.
 *
 * AGRUPA POR PROVEEDOR. Nadie manda tres órdenes separadas al mismo proveedor
 * el mismo día: se manda una con tres líneas. Pedir de a una pieza sería
 * cómodo de programar y molesto de usar.
 *
 * Las OC nacen en 'draft': esto prepara la compra, no la envía. Quién y cuándo
 * se manda al proveedor sigue siendo decisión de una persona.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Solicitud inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { part_ids, quantities = {}, notes } = parsed.data;

    const { data: parts, error: partsError } = await supabaseAdmin
      .from('machine_parts')
      .select(`
        id, name, part_number, criticality, lead_time_days, preferred_supplier,
        supplier_part_ref, unit_cost, min_stock, quantity_installed, is_imported,
        expected_life_usage, last_replaced_usage, inventory_item_id,
        machines ( id, name, usage_counter )
      `)
      .in('id', part_ids)
      .eq('is_active', true);

    if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 });
    if (!parts?.length) {
      return NextResponse.json({ error: 'No se encontraron las piezas' }, { status: 404 });
    }

    // Ya pedidas: no se vuelve a pedir lo que viene en camino.
    const { data: enCurso } = await supabaseAdmin
      .from('machine_parts_on_order_v')
      .select('part_id, oc_number, supplier, expected_date')
      .in('part_id', part_ids);

    const yaPedidas = new Map((enCurso ?? []).map((o) => [o.part_id as string, o]));
    const pedibles = parts.filter((p) => !yaPedidas.has(p.id));

    if (pedibles.length === 0) {
      return NextResponse.json({
        created: [],
        skipped: parts.map((p) => ({
          part_id: p.id, name: p.name, reason: 'Ya tiene una compra en curso',
          oc: yaPedidas.get(p.id)?.oc_number ?? null,
        })),
      });
    }

    // Ritmo por máquina, para calcular cuánto conviene pedir.
    const machineIds = [...new Set(pedibles.map((p) => (p.machines as { id: string } | null)?.id).filter(Boolean))] as string[];
    const { data: rates } = machineIds.length
      ? await supabaseAdmin.from('machine_usage_rate_v').select('machine_id, uso_por_dia').in('machine_id', machineIds)
      : { data: [] as { machine_id: string; uso_por_dia: number | null }[] };
    const rateByMachine = new Map((rates ?? []).map((r) => [r.machine_id, r.uso_por_dia]));

    // ── Agrupar por proveedor ──
    const SIN_PROVEEDOR = 'Proveedor por definir';
    const porProveedor = new Map<string, typeof pedibles>();
    for (const p of pedibles) {
      const prov = p.preferred_supplier?.trim() || SIN_PROVEEDOR;
      porProveedor.set(prov, [...(porProveedor.get(prov) ?? []), p]);
    }

    const created: unknown[] = [];

    for (const [supplier, items] of porProveedor) {
      // El plazo de la OC es el de la pieza que más demora: la orden no llega
      // completa antes que su línea más lenta.
      const maxLead = Math.max(...items.map((p) => p.lead_time_days ?? 15));
      const expected = new Date();
      expected.setDate(expected.getDate() + maxLead);

      const lineas = items.map((p) => {
        const machine = p.machines as { name: string; usage_counter: number | null } | null;
        const usagePerDay = rateByMachine.get((p.machines as { id: string } | null)?.id ?? '') ?? null;

        const sugerida = suggestedMinStock({
          usageCounter: Number(machine?.usage_counter ?? 0),
          lastReplacedUsage: p.last_replaced_usage,
          expectedLifeUsage: p.expected_life_usage,
          usagePerDay,
          leadTimeDays: p.lead_time_days,
          criticality: (p.criticality ?? 'media') as PartCriticality,
          isImported: p.is_imported ?? false,
          quantityInstalled: Number(p.quantity_installed ?? 1),
        });

        const cantidad =
          quantities[p.id] ??
          sugerida ??
          Math.max(1, Number(p.min_stock ?? 0) || Number(p.quantity_installed ?? 1));

        return {
          part: p,
          machineName: machine?.name ?? '—',
          quantity: cantidad,
          unit_cost: p.unit_cost ?? null,
        };
      });

      const total = lineas.reduce((acc, l) => acc + (l.unit_cost ?? 0) * l.quantity, 0);

      const detalle = lineas
        .map((l) => `· ${l.part.name}${l.part.part_number ? ` (${l.part.part_number})` : ''} — ${l.machineName} × ${l.quantity}`)
        .join('\n');

      const { data: oc, error: ocError } = await supabaseAdmin
        .from('purchases')
        .insert({
          supplier,
          status: 'draft',
          total_cost: total,
          purchase_date: new Date().toISOString().slice(0, 10),
          expected_date: expected.toISOString().slice(0, 10),
          notes: [
            'Repuestos solicitados desde Mecánica y Abastecimiento.',
            detalle,
            notes ?? '',
          ].filter(Boolean).join('\n\n'),
        })
        .select('*')
        .single();

      if (ocError) return NextResponse.json({ error: ocError.message }, { status: 500 });

      const { error: itemsError } = await supabaseAdmin.from('purchase_items').insert(
        lineas.map((l) => ({
          purchase_id: oc.id,
          machine_part_id: l.part.id,
          item_id: l.part.inventory_item_id ?? null,
          description: `${l.part.name}${l.part.supplier_part_ref ? ` · ref ${l.part.supplier_part_ref}` : ''} — ${l.machineName}`,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
        }))
      );

      if (itemsError) {
        // Una OC sin líneas es peor que ninguna: se deshace.
        await supabaseAdmin.from('purchases').delete().eq('id', oc.id);
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }

      created.push({
        purchase_id: oc.id,
        oc_number: oc.oc_number,
        supplier,
        expected_date: oc.expected_date,
        total_cost: total,
        lines: lineas.length,
        parts: lineas.map((l) => ({ part_id: l.part.id, name: l.part.name, quantity: l.quantity })),
      });
    }

    return NextResponse.json(
      {
        created,
        skipped: parts
          .filter((p) => yaPedidas.has(p.id))
          .map((p) => ({
            part_id: p.id, name: p.name, reason: 'Ya tiene una compra en curso',
            oc: yaPedidas.get(p.id)?.oc_number ?? null,
          })),
        // Las OC quedan en borrador a propósito: preparar la compra no es
        // enviarla, y esa decisión sigue siendo de una persona.
        message: `${created.length} orden(es) de compra en borrador. Revísalas en Compras antes de enviarlas al proveedor.`,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'No se pudo generar la solicitud de compra' }, { status: 500 });
  }
}

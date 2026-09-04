import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { rollupFromDbAggregates, aggregateRollup, rollupByClient, hasClientConflict, type DbCostAggregate, type OTRevenue } from '@/lib/cost-rollup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ots/cost-summary — LA puerta única del costo por OT.
 *
 * Antes devolvía la vista `ot_cost_summary` tal cual. La vista está bien
 * construida (filtra por `kind`), pero no puede expresar lo que la auditoría
 * dejó al descubierto: en el ledger conviven 600 líneas de estimación del
 * asistente, 32 de costo real, y 260 de una siembra de demostración que suman
 * $5.974 entre todas. Sumarlas da un número sin significado.
 *
 * Ahora se agrega en `cost-rollup.ts` —puro y testeado— que separa por `kind`,
 * excluye lo sembrado por defecto, y devuelve la PROCEDENCIA junto a cada
 * número para que la pantalla pueda decir de qué se apoya en vez de mostrar un
 * peso y callarse.
 *
 * `?include_seed=1` para ver la ficción a propósito. `?ot_id=` para una sola.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const includeSeed = searchParams.get('include_seed') === '1';
  const otId = searchParams.get('ot_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let otsQuery = supabaseAdmin
    .from('ots')
    // `clients(name)` trae el nombre según la FK: si difiere del texto que
    // escribió el vendedor, la OT no se le atribuye a ningún cliente.
    .select('id, ot_number, client_name, client_id, total_price, created_at, status, clients ( name )');
  if (otId) otsQuery = otsQuery.eq('id', otId);
  if (from) otsQuery = otsQuery.gte('created_at', from);
  if (to) otsQuery = otsQuery.lte('created_at', to);

  const { data: ots, error: otsError } = await otsQuery;
  if (otsError) return NextResponse.json({ error: otsError.message }, { status: 500 });

  const otIds = (ots ?? []).map((o) => o.id);
  // Un RPC, no páginas de filas: la suma y el conteo por procedencia corren
  // en Postgres sobre idx_ot_cost_lines_ot -- nunca baja una línea de costo
  // cruda a Node. No hay tope de PostgREST que esquivar con fetchAll porque
  // no hay filas de costo que paginar: el resultado son ~tantas filas como
  // OTs pedidas, no como líneas del ledger (auditoría de rendimiento 2026-09-08).
  const { data: aggregates, error: aggError } = otIds.length
    ? await supabaseAdmin.rpc('ot_cost_rollup', { p_ot_ids: otIds, p_include_seed: includeSeed })
    : { data: [] as DbCostAggregate[], error: null };
  if (aggError) return NextResponse.json({ error: aggError.message }, { status: 500 });

  const revenues: OTRevenue[] = (ots ?? []).map((o) => ({
    ot_id: o.id,
    ot_number: o.ot_number,
    client_name: o.client_name,
    client_id: o.client_id,
    client_name_fk: (o.clients as { name: string } | null)?.name ?? null,
    revenue: o.total_price,
  }));

  // La agregación no carga fecha (es puro costo/margen); se guarda aparte
  // para no tener que tocar su firma sólo por esto.
  const createdAtByOt = new Map((ots ?? []).map((o) => [o.id, o.created_at as string | null]));

  const rows = rollupFromDbAggregates((aggregates ?? []) as DbCostAggregate[], revenues);
  rows.sort((a, b) => String(b.ot_number ?? '').localeCompare(String(a.ot_number ?? '')));

  return NextResponse.json({
    // `data` se conserva con la forma que ya consumía OTFinancialTracking.
    data: rows.map((r) => ({
      ot_id: r.ot_id,
      ot_number: r.ot_number,
      client_name: r.client_name,
      revenue: r.revenue,
      estimated_cost: r.estimated_cost,
      actual_cost: r.actual_cost,
      material_actual: r.by_category.material,
      labor_actual: r.by_category.labor,
      machine_actual: r.by_category.machine,
      other_actual: r.by_category.finishing + r.by_category.outsourced + r.by_category.overhead + r.by_category.other,
      gross_margin: r.gross_margin,
      margin_pct: r.margin_pct,
      provenance: r.provenance,
      unreliable: r.unreliable,
      created_at: createdAtByOt.get(r.ot_id) ?? null,
    })),
    totals: aggregateRollup(rows),
    // La pregunta por la que existe este módulo: ¿qué cliente deja plata?
    by_client: rollupByClient(rows, revenues),
    client_conflicts: revenues.filter(hasClientConflict).length,
    // Nada que truncar: el RPC agrega el ledger entero server-side en una
    // sola pasada, no en páginas de 1.000 que PostgREST pudiera cortar en
    // silencio -- ese riesgo lo tenía el fetchAll que esto reemplaza.
    truncated: null as string | null,
  });
}

// Appends manual ACTUAL cost lines to the ledger for an OT.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const otId = body?.ot_id;
  if (!otId) return NextResponse.json({ error: 'ot_id is required' }, { status: 400 });

  const rows = (Array.isArray(body?.lines) ? body.lines : [])
    .filter((l: any) => Number(l?.unit_cost) > 0)
    .map((l: any) => ({
      ot_id: otId,
      kind: 'actual',
      category: l.category ?? 'other',
      source: 'manual',
      description: l.description || 'Costo manual',
      quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
      unit: l.unit || 'unit',
      unit_cost: Number(l.unit_cost),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No hay líneas de costo con valor' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('ot_cost_lines' as any).insert(rows as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

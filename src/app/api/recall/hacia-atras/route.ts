import { NextRequest, NextResponse } from 'next/server';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  agruparLotes,
  alcance,
  revisarCadena,
  type Consumo,
  type LoteEnLaCadena,
  type OTAfectada,
  type TraceBackward,
} from '@/lib/recall-trace';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recall/hacia-atras — del reclamo al lote, y de vuelta.
 *
 * `/api/recall?lot_id=` ya iba hacia adelante: dado un lote sospechoso, quién
 * recibió producto hecho con él. Es la mitad que pide el auditor.
 *
 * Esta es la mitad que aparece en la vida real. Llama un cliente con una caja
 * que se abre sola; lo que hay es un número de guía o un nombre. De ahí al
 * papel, y después hacia adelante otra vez — porque el mismo lote está en
 * trabajos que todavía nadie reclamó, y ese es el alcance real del problema.
 *
 *   ?ot=41221      · por número de OT
 *   ?guia=G-0044   · por guía de despacho
 *   ?client_id=…   · todo lo despachado a un cliente
 *
 * Todo en una respuesta y no en tres viajes: el criterio de FSSC 22000 no es que
 * el dato exista, es reconstruir la cadena en menos de cuatro horas.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const q = req.nextUrl.searchParams;
  const otNumber = q.get('ot');
  const guia = q.get('guia');
  const clientId = q.get('client_id');

  if (!otNumber && !guia && !clientId) {
    return NextResponse.json(
      { error: 'Indicá una OT, una guía o un cliente.' },
      { status: 400 }
    );
  }

  // ── 1 · De lo que trae el reclamo, a las OT ──────────────────────────────
  let otIds: string[] = [];
  let subject: TraceBackward['subject'];

  if (guia) {
    const { data } = await supabaseAdmin
      .from('dispatch_guides')
      .select('ot_id')
      .ilike('guide_number', `%${guia}%`);
    otIds = ((data ?? []) as { ot_id: string | null }[]).map((g) => g.ot_id).filter(Boolean) as string[];
    subject = { kind: 'guia', label: guia };
  } else if (clientId) {
    const { data } = await supabaseAdmin.from('ots').select('id').eq('client_id', clientId);
    otIds = ((data ?? []) as { id: string }[]).map((o) => o.id);
    subject = { kind: 'cliente', label: clientId };
  } else {
    // Como la búsqueda por guía: parcial y sin distinguir mayúsculas. Un
    // `.eq` exacto exigía teclear "OT-40879" entero cuando el campo invitaba
    // a escribir sólo el número — cualquier búsqueda razonable volvía vacía
    // (2026-08 audit).
    const { data } = await supabaseAdmin.from('ots').select('id').ilike('ot_number', `%${otNumber}%`);
    otIds = ((data ?? []) as { id: string }[]).map((o) => o.id);
    subject = { kind: 'ot', label: otNumber! };
  }

  if (otIds.length === 0) {
    const vacio: TraceBackward = {
      subject, ots: [], lots: [], blastRadius: [], clientsReached: [],
      warnings: revisarCadena({ ots: [], lots: [] }),
    };
    return NextResponse.json({ trace: vacio, alcance: alcance(vacio) });
  }

  // ── 2 · Las OT, con sus guías ────────────────────────────────────────────
  const ots = await cargarOTs(otIds);

  // ── 3 · Hacia atrás: qué material consumieron ────────────────────────────
  const { data: txs } = await supabaseAdmin
    .from('inventory_stock_transactions')
    .select('lot_id, quantity, created_at, authorized_deviation, deviation_reason')
    .in('work_order_id', otIds)
    .eq('tx_type', 'consumption')
    .not('lot_id', 'is', null);

  const consumos: Consumo[] = ((txs ?? []) as Record<string, any>[]).map((t) => ({
    lotId: String(t.lot_id),
    lotNumber: '',
    material: null,
    quantity: Number(t.quantity ?? 0),
    consumedAt: String(t.created_at),
    authorizedDeviation: !!t.authorized_deviation,
    deviationReason: t.deviation_reason ?? null,
  }));

  const lotIds = Array.from(new Set(consumos.map((c) => c.lotId)));
  const detalles = await cargarLotes(lotIds);
  const lots = agruparLotes(consumos, detalles);

  // ── 4 · Y hacia adelante otra vez: qué MÁS salió de esos lotes ───────────
  //
  // El reclamo es de una caja; el problema es del lote. Contestar sólo por la
  // OT que reclamó deja al resto de los clientes en la calle.
  let blastRadius: OTAfectada[] = [];
  if (lotIds.length > 0) {
    const { data: otras } = await supabaseAdmin
      .from('inventory_stock_transactions')
      .select('work_order_id')
      .in('lot_id', lotIds)
      .eq('tx_type', 'consumption')
      .not('work_order_id', 'is', null);

    const otrasIds = Array.from(
      new Set(((otras ?? []) as { work_order_id: string }[]).map((t) => t.work_order_id)),
    ).filter((id) => !otIds.includes(id));

    if (otrasIds.length > 0) blastRadius = await cargarOTs(otrasIds);
  }

  const clientsReached = Array.from(
    new Set([...ots, ...blastRadius].map((o) => o.clientName).filter(Boolean) as string[]),
  );

  const trace: TraceBackward = {
    subject,
    ots,
    lots,
    blastRadius,
    clientsReached,
    warnings: revisarCadena({ ots, lots }),
  };

  return NextResponse.json({ trace, alcance: alcance(trace) });
}

/** Las OT con sus guías, en dos consultas y no una por OT. */
async function cargarOTs(ids: string[]): Promise<OTAfectada[]> {
  const [{ data: filas }, { data: guias }] = await Promise.all([
    supabaseAdmin.from('ots').select('id, ot_number, client_name, status').in('id', ids),
    supabaseAdmin
      .from('dispatch_guides')
      .select('ot_id, guide_number, dispatch_date, quantity')
      .in('ot_id', ids),
  ]);

  const porOT = new Map<string, OTAfectada['guides']>();
  for (const g of ((guias ?? []) as Record<string, any>[])) {
    const k = String(g.ot_id);
    porOT.set(k, [
      ...(porOT.get(k) ?? []),
      {
        guideNumber: String(g.guide_number),
        dispatchDate: g.dispatch_date ?? null,
        quantity: g.quantity == null ? null : Number(g.quantity),
      },
    ]);
  }

  return ((filas ?? []) as Record<string, any>[]).map((o) => ({
    otId: String(o.id),
    otNumber: String(o.ot_number),
    clientName: o.client_name ?? null,
    status: String(o.status),
    guides: porOT.get(String(o.id)) ?? [],
  }));
}

/** El detalle de cada lote, incluido el eslabón hacia el proveedor. */
async function cargarLotes(ids: string[]) {
  if (ids.length === 0) return new Map<string, Omit<LoteEnLaCadena, 'quantityInSubject' | 'deviationAtUse'>>();

  const { data } = await supabaseAdmin
    .from('inventory_lots')
    .select(
      'id, lot_number, supplier_name, certification_code, certification_expires_on, received_date, ' +
      'inventory_items ( name ), purchases ( oc_number )'
    )
    .in('id', ids);

  return new Map(
    ((data ?? []) as Record<string, any>[]).map((l) => [
      String(l.id),
      {
        lotId: String(l.id),
        lotNumber: String(l.lot_number),
        material: l.inventory_items?.name ?? null,
        supplier: l.supplier_name ?? null,
        ocNumber: l.purchases?.oc_number ?? null,
        certificationCode: l.certification_code ?? null,
        certificationExpiresOn: l.certification_expires_on ?? null,
        receivedDate: l.received_date ?? null,
      },
    ])
  );
}

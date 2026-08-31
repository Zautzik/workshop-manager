import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { approvalState, approvalSummary, type ApprovalRow } from '@/lib/approval';

// GET /api/track/[token] — public, no auth required.
// token = ots.share_token (a dedicated random uuid, NOT the primary key —
// see migration 20260717120000: leaked internal ids no longer grant access,
// and regenerating the token revokes every previously shared link).
//
// Returns only client-safe fields: no prices, no internal notes, no ids.
// The stage timeline comes from ot_status_history (dates + statuses only).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Enlace inválido' }, { status: 400 });
  }

  const { data: ot, error } = await supabaseAdmin
    .from('ots')
    .select('id, ot_number, client_name, product_name, quantity, status, deadline, created_at')
    .eq('share_token' as any, token)
    .maybeSingle();

  if (error || !ot) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  // Mejor esfuerzo, con aviso: si esto falla, el pedido igual se puede
  // mostrar (linea de tiempo vacía es peor pantalla, no pantalla rota) --
  // pero el error se registra en vez de leerse como "sin historial todavía".
  const { data: history, error: historyError } = await supabaseAdmin
    .from('ot_status_history')
    .select('to_status, created_at')
    .eq('ot_id', ot.id)
    .eq('rollback', false)
    .order('created_at', { ascending: true });
  if (historyError) console.error('track: fallo leyendo ot_status_history:', historyError.message);

  // El estado del visto bueno, sólo lo que un cliente puede ver de sí mismo:
  // si ya decidió, qué decidió y a qué vuelta va -- nada de ids ni de precios.
  // Sin esto la pantalla no puede saber si mostrar el formulario o el
  // resultado ya guardado (auditoría 2026-08-31, Fase C). Best-effort por lo
  // mismo que el historial -- pero acá un fallo silencioso podría mostrar el
  // formulario a alguien que ya aprobó, así que se registra el error y no se
  // finge que "sin datos" significa "nada aprobado todavía".
  const { data: aprobaciones, error: aprobacionesError } = await supabaseAdmin
    .from('ot_approvals')
    .select('decision, round, decided_at, reject_reason, proofed_on, confirmed_via, approver_name')
    .eq('ot_id', ot.id)
    .order('round', { ascending: true });
  if (aprobacionesError) console.error('track: fallo leyendo ot_approvals:', aprobacionesError.message);

  const estado = approvalState((aprobaciones ?? []) as unknown as ApprovalRow[]);

  return NextResponse.json({
    ot_number: ot.ot_number,
    client_name: ot.client_name,
    product_name: ot.product_name,
    quantity: ot.quantity,
    status: ot.status,
    deadline: ot.deadline,
    created_at: ot.created_at,
    history: (history ?? []).map((h) => ({ status: h.to_status, at: h.created_at })),
    approval: {
      // Sólo se puede decidir mientras está en visto_bueno Y todavía no hay
      // un sí registrado -- el mismo par de condiciones que exige la ruta que
      // guarda la decisión, dichas acá para que la pantalla no ofrezca un
      // botón que el servidor va a rechazar.
      puedeDecidir: ot.status === 'visto_bueno' && !estado.approved,
      aprobado: estado.approved,
      rondas: estado.rounds,
      resumen: estado.rounds > 0 ? approvalSummary(estado) : null,
    },
  });
}

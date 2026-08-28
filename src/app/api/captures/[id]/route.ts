import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveFlow } from '@/lib/whatsapp-flow';
import { applyFlowProposal } from '@/lib/whatsapp-apply';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const ReviewSchema = z.object({
  status: z.enum(['approved', 'auto_approved', 'rejected', 'needs_revision', 'pending']),
  review_comments: z.string().max(2000).optional().nullable(),
  // optional corrections applied before approval
  corrected_costs: z.any().optional(),
  quantity: z.coerce.number().optional(),
  unit_cost: z.coerce.number().optional(),
});

// PATCH /api/captures/[id] — review a capture. On approval, the router
// (apply_capture_event) feeds it to the right system (real costs / inventory).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = {
    status: d.status,
    reviewed_by: auth.id,
    reviewed_at: new Date().toISOString(),
  };
  if (d.review_comments !== undefined) patch.review_comments = d.review_comments;
  if (d.corrected_costs !== undefined) patch.corrected_costs = d.corrected_costs;
  if (d.quantity !== undefined) patch.quantity = d.quantity;
  if (d.unit_cost !== undefined) patch.unit_cost = d.unit_cost;

  const { data, error } = await supabaseAdmin
    .from('capture_events' as any)
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On approval, route the capture to its system (best-effort, like the legacy feed).
  let applyWarning: string | undefined;
  const row = data as any;
  const aprobada = d.status === 'approved' || d.status === 'auto_approved';

  if (aprobada && row && !row.applied) {
    const { error: applyErr } = await supabaseAdmin.rpc('apply_capture_event' as any, { p_event_id: id });
    if (applyErr) applyWarning = `Aprobada, pero no se pudo aplicar: ${applyErr.message}`;
  }

  // ── El parte no es sólo plata ────────────────────────────────────────────
  //
  // `apply_capture_event` sabe convertir una captura en líneas de costo y en
  // movimientos de inventario, y ahí se terminaba: las horas, la merma y los
  // problemas que el parser venía extrayendo desde hace meses no tenían destino,
  // y ningún mensaje del taller movía una OT.
  //
  // Esto los lleva a donde van. Se hace acá, en TypeScript, y no dentro del
  // router de Postgres, porque la decisión necesita el vocabulario del taller
  // («revisada», «entregada», «corte») y el grafo del recorrido — los dos viven
  // en el código, y copiarlos a SQL sería mantener dos veces lo mismo.
  //
  // `!row.applied` es el mismo guardia que usa el router: `row` viene del UPDATE,
  // así que trae el valor de ANTES de aplicar. Una segunda aprobación de la
  // misma captura lo encuentra en `true` y no vuelve a cerrar la pasada ni a
  // mover la OT — sin esto, refrescar la pantalla de revisión adelantaba la OT
  // dos etapas.
  let flowResult: unknown = null;
  if (aprobada && !row?.applied && row?.domain === 'production' && row?.ot_id) {
    const parsed = (row.corrected_data ?? row.parsed_data ?? {}) as Record<string, unknown>;
    const { data: ot } = await supabaseAdmin
      .from('ots').select('status').eq('id', row.ot_id).maybeSingle();

    if (ot) {
      const proposal = resolveFlow(ot.status, {
        ...parsed,
        message_type: row.event_type,
        // El supervisor que aprueba ya revisó el parte: su decisión pesa más que
        // la confianza que el parser le puso al texto.
        confidence: 100,
      });
      const outcome = await applyFlowProposal(row.ot_id, proposal, {
        id: auth.id,
        role: auth.role!,
      });
      flowResult = { ...outcome, proposal };
      if (outcome.blocked) {
        applyWarning = applyWarning
          ? `${applyWarning} · ${outcome.blocked}`
          : `Horas registradas, pero la OT no avanzó: ${outcome.blocked}`;
      }
    }
  }

  if (applyWarning) {
    return NextResponse.json({ data, flow: flowResult, _warning: applyWarning }, { status: 202 });
  }
  return NextResponse.json({ data, flow: flowResult });
}

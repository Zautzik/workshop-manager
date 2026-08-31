import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { approvalState, nextRound, validateApproval, type ApprovalRow } from '@/lib/approval';
import { validateTransition } from '@/lib/ot-state-machine';
import { loadRoleAccess } from '@/lib/transition-rules';
import { dispatchNotifications, emitDomainEvent } from '@/lib/domain-events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/track/[token]/approval — el cliente aprueba o rechaza, sin cuenta.
 *
 * `src/app/api/ots/[id]/approvals/route.ts` (la ruta que ya usa el vendedor)
 * dejó escrito el plan: "no es duplicación: la pantalla interna no va a ser
 * la única puerta — el enlace público de seguimiento va a escribir por esta
 * misma ruta." Esta ruta cumple esa promesa: misma validación
 * (`validateApproval`), misma numeración de vuelta (`nextRound`), misma
 * tabla — autenticada por el token en vez de por sesión.
 *
 * Fase C de la especificación de Pre-Prensa y Visto Bueno, nunca construida
 * hasta esta auditoría (2026-08-31): `/track/[token]` era de sólo lectura.
 *
 * ── Lo que no se puede saltear (la propia spec lo advierte) ─────────────────
 * Un token que aprueba es un token que compromete plata:
 *  - Sólo sirve mientras la OT está en `visto_bueno`. Antes no hay nada que
 *    aprobar; después ya se compró papel y una "aprobación" tardía no
 *    significa nada — esto hace de caducidad, atado al estado real y no a un
 *    reloj de pared que habría que inventar aparte.
 *  - Un solo uso quirúrgico: si ya existe una decisión `approved` para esta
 *    OT, no se acepta otra — ni otra aprobación (redundante) ni un rechazo
 *    tardío (eso es exactamente lo que la spec prohíbe: "que rechazar no sea
 *    posible después de aprobado"). Un rechazo SÍ puede pedir una vuelta
 *    nueva: es el ciclo normal de corregir y volver a mandar.
 *  - `confirmedVia` se fuerza a `'portal'` del lado del servidor: quien
 *    manda esto es, por definición, el propio enlace.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `ot_approvals.recorded_by` no tiene FK (ver comentario donde se usa) así
// que este UUID nunca necesita resolver a una fila real de `auth.users` --
// es una constante legible, no un id inventado.
const PORTAL_ACTOR = '00000000-0000-0000-0000-000000000000';

const CuerpoSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  approverName: z.string().max(120).nullish(),
  approverEmail: z.string().max(160).nullish(),
  approverRole: z.string().max(80).nullish(),
  proofedOn: z.enum(['pdf', 'prueba_fisica', 'maqueta']).nullish(),
  rejectReason: z.enum(['texto', 'color', 'estructura', 'otro']).nullish(),
  comments: z.string().max(2000).nullish(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Enlace inválido' }, { status: 400 });
  }

  // Público y sin sesión: la única defensa contra abuso es el límite por IP.
  const rl = enforceRouteRateLimit({
    req,
    key: `track:${buildRateLimitActor(req)}:approval`,
    limit: 10,
    windowMs: 60_000,
    message: 'Demasiados intentos. Esperá un momento y volvé a intentar.',
  });
  if (rl) return rl;

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const errores = validateApproval({ ...parsed.data, confirmedVia: 'portal' });
  if (errores.length > 0) {
    return NextResponse.json({ error: errores[0].message, errores }, { status: 422 });
  }

  const { data: ot, error: otErr } = await supabaseAdmin
    .from('ots')
    .select('id, ot_number, status, vb_id, total_price')
    .eq('share_token' as any, token)
    .maybeSingle();

  if (otErr || !ot) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  if ((ot as any).status !== 'visto_bueno') {
    return NextResponse.json(
      {
        error:
          (ot as any).status === 'pre_press'
            ? 'Todavía se está preparando la prueba — no hay nada que aprobar por ahora.'
            : 'Este pedido ya no está esperando una decisión: ya se avanzó más allá del visto bueno.',
      },
      { status: 409 },
    );
  }

  const { data: previas, error: previasErr } = await supabaseAdmin
    .from('ot_approvals')
    .select('round, decision')
    .eq('ot_id', (ot as any).id);
  if (previasErr) return NextResponse.json({ error: previasErr.message }, { status: 500 });
  const anteriores = (previas ?? []) as unknown as ApprovalRow[];

  // Ya aprobado: ni otra aprobación (redundante) ni un rechazo tardío (eso es
  // lo que la spec prohíbe explícitamente).
  if (approvalState(anteriores).approved) {
    return NextResponse.json(
      { error: 'Ya se registró una aprobación para este pedido — no se puede volver a decidir.' },
      { status: 409 },
    );
  }

  const cadena = req.headers.get('x-forwarded-for') ?? '';
  const ip = cadena.split(',')[0]?.trim() || null;

  const fila = {
    ot_id: (ot as any).id,
    vb_id: (ot as any).vb_id ?? null,
    decision: parsed.data.decision,
    round: nextRound(anteriores),
    approver_name: parsed.data.approverName?.trim() || null,
    approver_email: parsed.data.approverEmail?.trim() || null,
    approver_role: parsed.data.approverRole?.trim() || null,
    confirmed_via: 'portal' as const,
    proofed_on: parsed.data.proofedOn ?? null,
    reject_reason: parsed.data.rejectReason ?? null,
    comments: parsed.data.comments?.trim() || null,
    decided_at: new Date().toISOString(),
    source_ip: ip,
    status: parsed.data.decision === 'approved' ? 'approved' : 'rejected',
    resolved_at: new Date().toISOString(),
    // `ot_approvals_decidida_tiene_quien_y_cuando` exige `recorded_by IS NOT
    // NULL` en cualquier fila decidida -- a propósito, según su propio
    // comentario: "una fila decidida sin responsable ni reloj es una
    // afirmación, no un registro". La regla asumía que quien decide siempre
    // es un vendedor con sesión (`auth.id`); acá no hay ninguno.
    //
    // `recorded_by` no tiene FK (columna `UUID` sin REFERENCES, ver
    // 20260303130000) así que no hace falta un usuario real -- pero tampoco
    // corresponde inventar un vendedor que no actuó. `PORTAL_ACTOR` es un
    // UUID nulo constante y documentado, la misma idea que ya usa
    // `dev-bypass-guard.ts` para "no hay una persona identificada acá": la
    // responsabilidad real de esta fila la sostienen `approver_name` +
    // `source_ip` + `confirmed_via: 'portal'`, no este campo.
    recorded_by: PORTAL_ACTOR,
    requested_by: null,
  };

  const { data: creada, error: insertErr } = await supabaseAdmin
    .from('ot_approvals')
    .insert(fila as never)
    .select('decision, round')
    .single();

  if (insertErr) {
    const conflicto = insertErr.code === '23505';
    return NextResponse.json(
      {
        error: conflicto
          ? 'Esta vuelta ya se decidió hace un momento. Recargá la página.'
          : 'No se pudo registrar la decisión.',
      },
      { status: conflicto ? 409 : 500 },
    );
  }

  // Aprobar hace avanzar la OT a Compra de Papel -- lo mismo que hace
  // `VistoBuenoDialog` para una aprobación registrada por el vendedor. La
  // aprobación YA QUEDÓ GUARDADA aunque esto no se pueda: un desvío de precio
  // que necesita reconfirmación no debe borrar la decisión del cliente.
  let avanzo = false;
  if (parsed.data.decision === 'approved') {
    const { data: vb } = (ot as any).vb_id
      ? await supabaseAdmin.from('vistos_buenos').select('total_price').eq('id', (ot as any).vb_id).maybeSingle()
      : { data: null };

    const check = validateTransition({
      fromStatus: 'visto_bueno',
      toStatus: 'paper_purchase',
      // No hay un usuario humano acá: es el sistema completando la acción que
      // la propia aprobación del cliente autoriza. `admin` es el único rol
      // con acceso a `paper_purchase` que no representa a una persona con
      // permisos que un cliente no debería heredar -- el gate real de "quién
      // puede hacer esto" es el token en sí, no este parámetro.
      role: 'admin',
      roleAccess: await loadRoleAccess(),
      hasApprovedApproval: true,
      hasAnyRealCosts: false,
      quotedPrice: (vb as any)?.total_price ?? null,
      firmPrice: (ot as any).total_price ?? null,
    });

    if (check.ok) {
      const nowIso = new Date().toISOString();
      const { data: movida, error: movidaError } = await supabaseAdmin
        .from('ots')
        .update({ status: 'paper_purchase', updated_at: nowIso })
        .eq('id', (ot as any).id)
        .eq('status', 'visto_bueno')
        .select('id')
        .maybeSingle();
      // Mejor esfuerzo a propósito (ver comentario más arriba): la
      // aprobación ya quedó guardada aunque esto falle. Pero un fallo real
      // acá no debe leerse igual que "otro proceso ya la movió" -- se
      // registra para que alguien lo note, en vez de quedar indistinguible
      // de la guarda de concurrencia.
      if (movidaError) console.error('track approval: fallo avanzando a paper_purchase:', movidaError.message);

      if (movida) {
        avanzo = true;
        await supabaseAdmin.from('ot_status_history').insert({
          ot_id: (ot as any).id,
          from_status: 'visto_bueno',
          to_status: 'paper_purchase',
          changed_by: null,
          changed_by_role: null,
          reason: 'visto_bueno_portal',
          rollback: false,
          metadata: { via: 'track_link', round: (creada as any).round },
        });
        // `paper_purchase` no es un hito hoy, así que esto no dispara aviso —
        // pero es el tercer camino que mueve `ots.status` y se completa la
        // bitácora igual que /transition y /split.
        const event = await emitDomainEvent({
          type: 'ot.status_changed',
          otId: (ot as any).id,
          actorId: null,
          actorRole: null,
          payload: {
            ot_number: (ot as any).ot_number ?? null,
            from_status: 'visto_bueno',
            to_status: 'paper_purchase',
            by_role: null,
            actor_name: 'el cliente (enlace de seguimiento)',
            reason: 'visto_bueno_portal',
          },
        });
        if (event) await dispatchNotifications(event);
      }
    }
  }

  return NextResponse.json({
    decision: (creada as any).decision,
    ot_number: (ot as any).ot_number,
    avanzo_a_compras: avanzo,
    mensaje:
      parsed.data.decision === 'approved'
        ? avanzo
          ? 'Aprobación registrada. El pedido pasa a producción.'
          : 'Aprobación registrada. El taller te va a contactar antes de seguir.'
        : 'Rechazo registrado. El taller va a revisar lo que indicaste y te va a mandar una prueba nueva.',
  });
}

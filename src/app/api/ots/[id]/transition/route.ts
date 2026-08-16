import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import type { Database, Json } from '@/integrations/supabase/types';
import {
  isValidStatus,
  type OTWorkflowStatus,
  validateTransition,
} from '@/lib/ot-state-machine';
import type { OTSpec } from '@/lib/ot-spec';

const TransitionSchema = z.object({
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  metadata: z.record(z.any()).optional(),
  rollback: z.boolean().optional(),
});

// POST /api/ots/[id]/transition
// Validates workflow rules and records audited state transition.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const rl = enforceRouteRateLimit({
    req,
    key: `ots:${buildRateLimitActor(req, auth.id)}:transition`,
    limit: 60,
    windowMs: 60_000,
    message: 'Demasiados cambios de estado seguidos. Espera un momento y reintenta.',
  });
  if (rl) return rl;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = TransitionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const toStatusRaw = parsed.data.to_status;
    if (!isValidStatus(toStatusRaw)) {
      return NextResponse.json({ error: 'Estado destino inválido' }, { status: 400 });
    }

    const toStatus = toStatusRaw as OTWorkflowStatus;

    const { data: ot, error: otError } = await supabaseAdmin
      .from('ots')
      // La ficha entera: las compuertas de completitud necesitan saber qué sabe
      // la OT, no sólo dónde está.
      .select(
        'id, ot_number, status, client_id, product_name, product_type, quantity, ' +
        'width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back, ' +
        'ink_coverage, deadline, assigned_machine_id, substrate_brand, substrate_supplier, ' +
        'sin_arte, total_price, vb_id, ' +
        // Las banderas y el herramental: sin traerlos, la ficha llega con las
        // terminaciones vacías y ninguna compuerta condicional se dispara.
        'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, ' +
        'finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion, ' +
        'die_source, die_code, die_id, cliche_code, relieve_matrix_code, lamination_type',
      )
      .eq('id', id)
      .single();

    if (otError || !ot) {
      return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
    }

    // La cadena de `select` concatenada no la puede inferir el tipo generado, así
    // que la fila se lee suelta. Los campos se usan de a uno más abajo.
    const o = ot as Record<string, any>;
    const fromStatus = o.status as OTWorkflowStatus;

    const [approvalResult, costsResult] = await Promise.all([
      supabaseAdmin
        .from('ot_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id)
        .eq('status', 'approved'),
      supabaseAdmin
        .from('ot_real_costs')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id),
    ]);

    // ── La ficha, para las compuertas ────────────────────────────────────
    //
    // `impositionConfirmed` y `operationsReviewed` no son columnas: se deducen de
    // que exista lo que producen. Un montaje confirmado deja un bloque de
    // programación; operaciones revisadas dejan líneas de operación. Preguntar
    // por el rastro es más fiable que por una casilla que alguien puede marcar
    // sin haber hecho el trabajo.
    const [programa, operaciones, arte, cotizacion, requisitos] = await Promise.all([
      supabaseAdmin.from('ot_machine_schedule').select('id', { count: 'exact', head: true }).eq('ot_id', id),
      supabaseAdmin.from('ot_operations').select('id', { count: 'exact', head: true }).eq('ot_id', id),
      supabaseAdmin.from('ot_attachments').select('id', { count: 'exact', head: true }).eq('ot_id', id),
      o.vb_id
        ? supabaseAdmin.from('vistos_buenos').select('total_price').eq('id', o.vb_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Lo que la OT necesita, para la compuerta de salida de Compras.
      supabaseAdmin
        .from('ot_requirements')
        .select('description, status')
        .eq('ot_id', id),
    ]);

    const spec: OTSpec = {
      clientId: o.client_id, productName: o.product_name, productType: o.product_type,
      quantity: o.quantity, widthCm: o.width_cm, heightCm: o.height_cm,
      substrateType: o.substrate_type, grammageGsm: o.grammage_gsm,
      colorFront: o.color_front, colorBack: o.color_back, inkCoverage: o.ink_coverage,
      deadline: o.deadline, pressId: o.assigned_machine_id,
      substrateBrand: o.substrate_brand, substrateSupplier: o.substrate_supplier,
      machineId: o.assigned_machine_id,
      impositionConfirmed: (programa.count ?? 0) > 0,
      operationsReviewed: (operaciones.count ?? 0) > 0,
      artAttached: (arte.count ?? 0) > 0,
      sinArte: o.sin_arte,
      // Las terminaciones REALES. Estaban en `{}` fijo —el mismo defecto que
      // tenía la ruta de Pre-Prensa— así que ninguna compuerta de herramental
      // podía dispararse: una OT troquelada pasaba a Visto Bueno sin que nadie
      // hubiera confirmado que el troquel existe.
      finishes: {
        troquelado: !!o.finish_troquelado,
        plegado: !!o.finish_plegado,
        pegado: !!o.finish_pegado,
        laminado: !!o.finish_laminado,
        barniz: !!o.finish_barniz,
        relieve: !!o.finish_relieve,
        perforado: !!o.finish_perforado,
        hot_stamping: !!o.finish_hot_stamping,
        uv_localizado: !!o.finish_uv_localizado,
        numeracion: !!o.finish_numeracion,
      },
      dieSource: o.die_id ? 'existente' : o.die_source,
      dieCode: o.die_id ? o.die_id : o.die_code,
      clicheCode: o.cliche_code,
      relieveMatrixCode: o.relieve_matrix_code,
      laminationType: o.lamination_type,
    };

    const transitionCheck = validateTransition({
      fromStatus,
      toStatus,
      role: auth.role!,
      spec,
      // Lo cotizado vive en el visto bueno; lo firme es el precio de la OT hoy,
      // ya recalculado con lo que Pre-Prensa completó.
      quotedPrice: (cotizacion as any)?.data?.total_price ?? null,
      firmPrice: o.total_price ?? null,
      repriceApproved: Boolean(parsed.data.metadata?.reprice_approved),
      hasApprovedApproval: (approvalResult.count ?? 0) > 0,
      hasAnyRealCosts: (costsResult.count ?? 0) > 0,
      rollback: parsed.data.rollback ?? false,
      // `?? undefined` y no `?? []`: una lista vacía significaría «no falta
      // nada» y dejaría pasar cualquier OT. Sin dato, la compuerta no corre.
      requirements: (requisitos.data as { description: string; status: string }[] | null) ?? undefined,
    });

    if (!transitionCheck.ok) {
      return NextResponse.json(
        {
          error: transitionCheck.message ?? 'Transition rejected',
          code: transitionCheck.code,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // Concurrency guard: scope the update by the status we validated against
    // (.eq('status', fromStatus)). If another request changed the OT between
    // our read and this write, zero rows match and we report a 409 instead of
    // silently clobbering their transition. Mirrors the bulk-transition route.
    // completed_at follows the status: stamped on completion, cleared when a
    // rollback takes the OT back out of completed (lead-time analytics read it).
    const { data: updatedOt, error: updateError } = await supabaseAdmin
      .from('ots')
      .update({
        status: toStatus,
        updated_at: nowIso,
        completed_at: toStatus === 'completed' ? nowIso : fromStatus === 'completed' ? null : undefined,
      })
      .eq('id', id)
      .eq('status', fromStatus)
      .select('id, ot_number, status, updated_at')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating OT status:', updateError);
      return NextResponse.json({ error: 'No se pudo actualizar el estado de la OT' }, { status: 500 });
    }

    if (!updatedOt) {
      return NextResponse.json(
        { error: 'La OT fue modificada por otra operación. Vuelve a intentarlo.', code: 'CONCURRENT_MODIFICATION' },
        { status: 409 }
      );
    }

    // Audit trail — best-effort, must not block the transition response.
    const { error: historyError } = await supabaseAdmin
      .from('ot_status_history')
      .insert({
        ot_id: id,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: auth.id,
        changed_by_role: auth.role,
        reason: parsed.data.reason ?? null,
        rollback: parsed.data.rollback ?? false,
        metadata: (parsed.data.metadata ?? {}) as unknown as Json,
      });
    if (historyError) {
      console.error('Error writing OT status history:', historyError);
    }

    const db = supabaseAdmin;

    // Notify only on milestone transitions — ready-for-delivery and completion.
    // Every intermediate plant move used to notify up to 20 managers, which is
    // ~20 pings per OT per day → notification fatigue (2026-07 audit). A digest
    // for the rest can come later.
    const MILESTONE_STATUSES: OTWorkflowStatus[] = ['ready_for_delivery', 'completed'];
    if (MILESTONE_STATUSES.includes(toStatus)) {
      const approverRoles: Array<Database['public']['Enums']['app_role']> = ['admin', 'supervisor', 'manager'];
      const { data: candidateUsers } = await db
        .from('user_roles')
        .select('user_id, role')
        .in('role', approverRoles)
        .neq('user_id', auth.id)
        .limit(20);

      if (Array.isArray(candidateUsers) && candidateUsers.length > 0) {
        const statusLabel = toStatus === 'completed' ? 'completada' : 'lista para despacho';
        const notifications = candidateUsers.map((row: { user_id: string; role: string }) => ({
          user_id: row.user_id,
          type: 'ot_status_changed' as const,
          title: `OT ${updatedOt.ot_number} ${statusLabel}`,
          message: `Cambiada por ${auth.name ?? auth.email}`,
          resource_type: 'ot',
          resource_id: id,
          metadata: {
            from_status: fromStatus,
            to_status: toStatus,
            by_role: auth.role,
            reason: parsed.data.reason ?? null,
            rollback: parsed.data.rollback ?? false,
            transition_metadata: parsed.data.metadata ?? {},
          },
        }));

        const { error: notificationError } = await db.from('notifications').insert(notifications);
        if (notificationError) {
          console.error('Error creating notifications:', notificationError);
        }
      }
    }

    return NextResponse.json(updatedOt);
  } catch (error) {
    console.error('Error transitioning OT:', error);
    return NextResponse.json({ error: 'No se pudo mover la OT de estado' }, { status: 500 });
  }
}

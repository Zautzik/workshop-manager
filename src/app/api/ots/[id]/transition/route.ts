import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import type { Json } from '@/integrations/supabase/types';
import {
  isValidStatus,
  type OTWorkflowStatus,
  validateTransition,
} from '@/lib/ot-state-machine';
import type { OTSpec } from '@/lib/ot-spec';
import { estimatedHoursFor, promptsStageReport } from '@/lib/stage-report';
import { loadRoleAccess } from '@/lib/transition-rules';
import { dispatchNotifications, emitDomainEvent } from '@/lib/domain-events';
import { tryBackflush } from '@/lib/backflush';

// Las mismas tres etapas donde /operaciones/escanear ofrece el recordatorio
// de escanear un lote (ver CierreDeEtapa.tsx) — es donde el papel deja bodega.
const BACKFLUSH_STAGES = new Set<OTWorkflowStatus>(['guillotine_first_cut', 'offset_printing', 'digital_printing']);

/**
 * El cierre de la etapa que termina. Viaja CON la transición y no por una ruta
 * aparte a propósito: si fueran dos llamadas, la que falla deja al taller con
 * una OT movida y sin horas —o con horas de una etapa que nunca se cerró—, que
 * es exactamente el estado que este registro viene a evitar.
 */
const StageReportSchema = z.object({
  // `null` es una respuesta válida: la pasada queda abierta y alguien la cierra
  // después. El tope acá es sólo para que no entre un número que desborde la
  // columna; el límite real —y el mensaje que explica que 480 son minutos, no
  // horas— vive en `validateStageReport`, porque un rechazo de Zod diría
  // «Number must be less than or equal to 400» en inglés y sin decir qué hacer.
  hours: z.coerce.number().positive().max(999_999).nullable().optional(),
  merma_sheets: z.coerce.number().int().min(0).optional().nullable(),
  waste_notes: z.string().max(2000).optional().nullable(),
  issues: z.string().max(2000).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
});

const TransitionSchema = z.object({
  to_status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  metadata: z.record(z.any()).optional(),
  rollback: z.boolean().optional(),
  stage_report: StageReportSchema.optional().nullable(),
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
        'die_source, die_code, die_id, cliche_code, relieve_matrix_code, lamination_type, ' +
        // Lo que el motor calculó: contra esto se juzga el cierre de la etapa —
        // los pliegos dicen si la merma es del arreglo o de un problema, y las
        // horas estimadas hacen saltar un 40 escrito donde se esperaba un 4.
        'calc_sheets, calc_print_hours, calc_finish_hours',
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

    const [approvalResult, costsResult, roleAccess] = await Promise.all([
      supabaseAdmin
        .from('ot_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id)
        .eq('status', 'approved'),
      supabaseAdmin
        .from('ot_real_costs')
        .select('id', { count: 'exact', head: true })
        .eq('ot_id', id),
      loadRoleAccess(),
    ]);

    // ── La ficha, para las compuertas ────────────────────────────────────
    //
    // `impositionConfirmed` y `operationsReviewed` no son columnas: se deducen de
    // que exista lo que producen. Un montaje confirmado deja un bloque de
    // programación; operaciones revisadas dejan líneas de operación. Preguntar
    // por el rastro es más fiable que por una casilla que alguien puede marcar
    // sin haber hecho el trabajo.
    const [programa, operaciones, arte, cotizacion, requisitos, abiertas] = await Promise.all([
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
      // Las pasadas que quedaron sin horas, para la compuerta de despacho.
      supabaseAdmin
        .from('ot_stage_reports')
        .select('workflow_step, created_at')
        .eq('ot_id', id)
        .is('hours', null),
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
      roleAccess,
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
      stageReport: parsed.data.stage_report
        ? {
            hours: parsed.data.stage_report.hours ?? null,
            mermaSheets: parsed.data.stage_report.merma_sheets ?? null,
            wasteNotes: parsed.data.stage_report.waste_notes ?? null,
            issues: parsed.data.stage_report.issues ?? null,
            observations: parsed.data.stage_report.observations ?? null,
          }
        : null,
      stageReportContext: {
        enteredSheets: o.calc_sheets ?? null,
        estimatedHours: estimatedHoursFor(fromStatus, o),
      },
      // `?? undefined` y no `?? []`: si la consulta falló, «no se sabe» no puede
      // significar «no queda nada abierto». Sin dato, la compuerta no corre.
      openPasses: (abiertas.data as { workflow_step: string; created_at: string }[] | null) ?? undefined,
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
    //
    // flag_paper_arrived follows a rollback into paper_purchase the same way:
    // the flag only ever got set to true (by the OC-receipt hook) and never
    // cleared, so a second shortage cycle kept reporting "el papel ya llegó"
    // for paper that no longer covers the job (auditoría 2026-08-30, Run 1 —
    // confirmed live: the second receive logged paper_flagged:false only
    // because it was already stuck true from the first).
    const { data: updatedOt, error: updateError } = await supabaseAdmin
      .from('ots')
      .update({
        status: toStatus,
        updated_at: nowIso,
        completed_at: toStatus === 'completed' ? nowIso : fromStatus === 'completed' ? null : undefined,
        flag_paper_arrived: parsed.data.rollback && toStatus === 'paper_purchase' ? false : undefined,
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

    // ── La pasada por la etapa ───────────────────────────────────────────
    //
    // Se escribe SIEMPRE que la OT deja una etapa que se cierra, traiga o no
    // traiga horas. Una fila sin horas no es una fila vacía: dice que la OT pasó
    // por acá, cuándo y hacia dónde, y que el dato todavía se debe. Sin ella no
    // habría a qué colgar las horas que llegan después por WhatsApp, ni qué
    // contarle a la compuerta de despacho.
    //
    // Un retroceso no abre nada: mover una tarjeta hacia atrás es corregir un
    // error de tablero, no terminar un trabajo.
    //
    // Va DESPUÉS del movimiento y no antes: la actualización es la operación
    // disputada —lleva el guardia de concurrencia— y una pasada escrita antes
    // quedaría hablando de una etapa que la OT nunca dejó si otro la movió
    // primero. El precio es que una falla acá deja la OT movida sin su rastro;
    // por eso no se traga en silencio como el historial: se avisa en la
    // respuesta para que el tablero lo diga.
    let stageReportWarning: string | null = null;
    if (promptsStageReport(fromStatus) && !parsed.data.rollback) {
      const r = parsed.data.stage_report;
      const { error: reportError } = await supabaseAdmin.from('ot_stage_reports').insert({
        ot_id: id,
        workflow_step: fromStatus,
        to_status: toStatus,
        hours: r?.hours ?? null,
        merma_sheets: r?.merma_sheets ?? null,
        waste_notes: r?.waste_notes?.trim() || null,
        issues: r?.issues?.trim() || null,
        observations: r?.observations?.trim() || null,
        // La máquina que corrió la etapa. Es lo que después convierte las horas
        // en plata, y hoy sale de la asignada a la OT porque es el único dato
        // que existe sin pedirle una elección más a quien está en el taller.
        machine_id: o.assigned_machine_id ?? null,
        recorded_by: auth.id,
      });
      if (reportError) {
        console.error('Error writing OT stage report:', reportError);
        stageReportWarning =
          'La OT avanzó, pero la pasada por la etapa no quedó registrada. Avisá para que se cargue a mano.';
      }
    }

    // Backflush: si la máquina de esta OT está en modo backflush y la etapa
    // que se cierra es una que consume papel, se intenta el descuento
    // automático acá — mismo lugar que ya escribe la pasada de la etapa que
    // termina. Silencioso cuando no aplica (el caso normal: 'scan' es el
    // default); se avisa sólo cuando SÍ se intentó, para no ensuciar la
    // respuesta de cada transición común con un mensaje que no aplica.
    if (BACKFLUSH_STAGES.has(fromStatus) && !parsed.data.rollback) {
      const bf = await tryBackflush({ otId: id, stage: fromStatus });
      if (bf.attempted) {
        // `bf.reason` ya dice si fue completo o parcial (y cuánto faltó) — no
        // se reconstruye acá; un mensaje propio para el caso "consumed" perdía
        // justo el aviso de faltante que importa (confirmado en vivo: 100 de
        // 6500 pliegos se mostraba como "se descontaron 100" sin decir que
        // sobraban 6400 por completar a mano).
        const texto = bf.consumed
          ? `Backflush: ${bf.reason} — ${Math.round(bf.quantity ?? 0)} pliegos de ${bf.itemName} (lote ${bf.lotNumber}).`
          : `Backflush no pudo descontar: ${bf.reason}.`;
        stageReportWarning = stageReportWarning ? `${stageReportWarning} ${texto}` : texto;
      }
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

    // Bitácora + aviso a supervisión cuando corresponda. `dispatchNotifications`
    // decide sola si `toStatus` es un hito (ready_for_delivery/completed) — la
    // misma pregunta que antes vivía inline acá, ahora compartida con /split y
    // el visto bueno del portal, que movían el estado sin pasar por acá y por
    // eso no avisaban nunca.
    const event = await emitDomainEvent({
      type: 'ot.status_changed',
      otId: id,
      actorId: auth.id,
      actorRole: auth.role,
      payload: {
        ot_number: updatedOt.ot_number,
        from_status: fromStatus,
        to_status: toStatus,
        by_role: auth.role,
        actor_name: auth.name ?? auth.email,
        reason: parsed.data.reason ?? null,
        rollback: parsed.data.rollback ?? false,
        transition_metadata: parsed.data.metadata ?? {},
      },
    });
    if (event) await dispatchNotifications(event);

    return NextResponse.json(
      stageReportWarning ? { ...updatedOt, warning: stageReportWarning } : updatedOt,
    );
  } catch (error) {
    console.error('Error transitioning OT:', error);
    return NextResponse.json({ error: 'No se pudo mover la OT de estado' }, { status: 500 });
  }
}

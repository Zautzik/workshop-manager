import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { evaluateSchedule, decideCronOrderAction } from '@/lib/maintenance-due';
import { notifyScheduleDue } from '@/lib/maintenance-notify';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/maintenance-due-check
 *
 * Disparado una vez al día por Vercel Cron (ver vercel.json). `evaluateSchedule()`
 * hasta hoy sólo corría bajo demanda -- cuando alguien abría Vencimientos o
 * Pautas -- así que una pauta podía estar vencida días antes de que un humano
 * entrara a mirar y recién ahí se enterara. Esto cierra ese hueco: por cada
 * pauta ya vencida sin una orden abierta, crea la orden (mismo criterio que
 * el botón "Crear orden" de VencimientosPanel) y avisa -- in-app y WhatsApp,
 * ver maintenance-notify.ts.
 *
 * Idempotente para la CREACIÓN de la orden, no por fecha: el filtro es "¿ya
 * existe una orden pending/in_progress para esta pauta?" -- una vez creada,
 * las corridas siguientes la encuentran y no duplican la orden.
 *
 * El AVISO es una pregunta aparte (`notified_at`, ver la migración
 * 20260913120000): si el primer intento de avisar falla a mitad de camino
 * (una corrida anterior sufrió justo esto -- un corte real de conectividad a
 * Supabase durante la verificación de esta misma fase), la orden ya existe
 * pero nadie se enteró. Antes eso se perdía para siempre porque "ya existe
 * la orden" y "ya se avisó" eran el mismo chequeo; ahora una orden con
 * `notified_at` nulo se reintenta en la corrida siguiente en vez de saltarse.
 */
export async function GET(req: NextRequest) {
  // Vercel manda `Authorization: Bearer $CRON_SECRET` en las invocaciones de
  // Cron cuando esa variable está configurada -- sin CRON_SECRET seteado
  // (dev local) no se exige, igual que el resto de los checks de auth
  // best-effort de este proyecto no bloquean cuando el secreto no existe.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { data: schedules, error } = await supabaseAdmin
    .from('maintenance_schedules')
    .select(
      `id, machine_id, checklist_id, system_id, frequency_days, next_maintenance_date,
       frequency_usage, last_maintenance_usage,
       machines ( id, name, usage_counter )`
    );

  if (error) {
    logger.error({ err: error }, 'maintenance-due-check: no se pudieron cargar las pautas');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: rates } = await supabaseAdmin.from('machine_usage_rate_v').select('machine_id, uso_por_dia');
  const rateByMachine = new Map((rates ?? []).map((r) => [r.machine_id, r.uso_por_dia]));

  let created = 0;
  let notified = 0;
  let retriedNotify = 0;
  let skippedAlreadyOpen = 0;
  let skippedSinChecklist = 0;
  const errors: string[] = [];

  for (const s of schedules ?? []) {
    const machine = s.machines as { id: string; name: string; usage_counter: number | null } | null;
    if (!machine) continue;

    const due = evaluateSchedule({
      frequencyDays: s.frequency_days,
      nextMaintenanceDate: s.next_maintenance_date,
      frequencyUsage: s.frequency_usage,
      lastMaintenanceUsage: s.last_maintenance_usage,
      usageCounter: machine.usage_counter,
      usagePerDay: rateByMachine.get(machine.id) ?? null,
    });

    if (due.status !== 'vencida') continue;

    // Sin checklist, "Crear orden" tampoco se ofrece en Vencimientos (ver
    // ScheduleRowItem.canCreate) -- mismo criterio acá, no uno más laxo.
    if (!s.checklist_id) {
      skippedSinChecklist++;
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from('maintenance_work_orders')
      .select('id, notified_at')
      .eq('schedule_id', s.id)
      .in('status', ['pending', 'in_progress'])
      .limit(1)
      .maybeSingle();

    const action = decideCronOrderAction(existing ?? null);

    if (action === 'skip') {
      skippedAlreadyOpen++;
      continue;
    }

    let orderId = existing?.id ?? null;

    if (action === 'create') {
      const { data: order, error: insertError } = await supabaseAdmin
        .from('maintenance_work_orders')
        .insert({
          machine_id: s.machine_id,
          work_order_type: 'preventivo',
          checklist_id: s.checklist_id,
          schedule_id: s.id,
          system_id: s.system_id,
          scheduled_date: new Date().toISOString().slice(0, 10),
          priority: 2,
          status: 'pending',
          usage_at_creation: machine.usage_counter ?? null,
        })
        .select('id')
        .single();

      if (insertError || !order) {
        errors.push(`schedule ${s.id}: ${insertError?.message ?? 'insert falló'}`);
        continue;
      }
      orderId = order.id;
      created++;
    } else {
      retriedNotify++;
    }

    if (!orderId) {
      // Inalcanzable en la práctica -- decideCronOrderAction sólo devuelve
      // 'retry_notify' cuando `existing` es no nulo -- pero el compilador no
      // puede probarlo a través de la función, y "explota en silencio con un
      // undefined" es peor que un mensaje de error claro acá.
      errors.push(`schedule ${s.id}: orderId inesperadamente nulo`);
      continue;
    }

    try {
      await notifyScheduleDue({
        scheduleId: s.id,
        workOrderId: orderId,
        machineName: machine.name,
        reason: due.reason,
      });
      await supabaseAdmin
        .from('maintenance_work_orders')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', orderId);
      notified++;
    } catch (err) {
      // notified_at se queda null a propósito -- la corrida de mañana
      // reintenta el aviso para esta misma orden en vez de darla por avisada.
      errors.push(`notify ${orderId}: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  }

  return NextResponse.json({
    created,
    notified,
    retried_notify: retriedNotify,
    skipped_already_open: skippedAlreadyOpen,
    skipped_sin_checklist: skippedSinChecklist,
    errors,
  });
}

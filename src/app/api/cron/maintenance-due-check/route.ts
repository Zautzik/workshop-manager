import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { evaluateSchedule } from '@/lib/maintenance-due';
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
 * Idempotente por construcción, no por fecha: no hace falta llevar "¿ya
 * avisé hoy?" porque el filtro real es "¿ya existe una orden pending/
 * in_progress para esta pauta?" -- una vez creada, las corridas siguientes
 * la encuentran y no duplican ni la orden ni el aviso.
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
      .select('id')
      .eq('schedule_id', s.id)
      .in('status', ['pending', 'in_progress'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      skippedAlreadyOpen++;
      continue;
    }

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
    created++;

    try {
      await notifyScheduleDue({
        scheduleId: s.id,
        workOrderId: order.id,
        machineName: machine.name,
        reason: due.reason,
      });
      notified++;
    } catch (err) {
      errors.push(`notify ${order.id}: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  }

  return NextResponse.json({
    created,
    notified,
    skipped_already_open: skippedAlreadyOpen,
    skipped_sin_checklist: skippedSinChecklist,
    errors,
  });
}

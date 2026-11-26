import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { PLAN_STEPS } from '@/lib/production-route';
import { passMachineCandidates, stageMachineTypes, type MachineRow, type ScheduleRow } from '@/lib/stage-machine';

// GET /api/machines/activity — carga real de cada máquina en 30 días.
//
// Las horas salen del libro: `ot_stage_reports.hours`, la pasada cerrada, el
// único dueño de las horas de producción (las mismas que valoriza
// stage-valuation.ts y que suman Rentabilidad y Mano de obra). Antes se
// derivaban del tiempo que la OT pasó en un ESTADO y se cargaban a la máquina
// asignada HOY a la OT: con 14,5 h en el libro la pantalla decía 0 h
// (auditoría C6, 2026-11-25).
//
// La máquina de cada pasada la decide el mismo resolutor que la valorización
// (stage-machine.ts): la guardada en la pasada, o la única candidata por
// tipo/agenda. Si quedan varias, esas horas van a «sin máquina» — se muestran,
// no se adivinan.
//
// "Produciendo ahora" sigue siendo una foto del estado actual de las OTs.
const PRODUCTION_STATUSES = new Set([
  'guillotine_first_cut', 'offset_printing', 'digital_printing', 'die_cutting',
  'guillotine_final_cut', 'workshop', 'workshop_revision',
]);
const WINDOW_DAYS = 30;
const DAY = 86_400_000;

interface Pass { id: string; ot_id: string; workflow_step: string; hours: number; machine_id: string | null }

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;

  const since = new Date(Date.now() - WINDOW_DAYS * DAY).toISOString();

  try {
    const [machinesRes, otsRes, passesRes] = await Promise.all([
      supabaseAdmin.from('machines').select('id, name, type, status, is_active'),
      supabaseAdmin.from('ots').select('id, assigned_machine_id, status').in('status', [...PRODUCTION_STATUSES] as any),
      fetchAll<Pass>((desde, hasta) =>
        supabaseAdmin
          .from('ot_stage_reports')
          .select('id, ot_id, workflow_step, hours, machine_id')
          .gt('hours', 0)
          .gte('created_at', since)
          .range(desde, hasta) as any,
      ),
    ]);
    if (machinesRes.error || otsRes.error) {
      console.error('Error fetching machine activity:', machinesRes.error ?? otsRes.error);
      return NextResponse.json({ error: 'Failed to fetch machine activity' }, { status: 500 });
    }

    const machines = (machinesRes.data ?? []) as Array<MachineRow & { name: string | null; status: string | null }>;
    // Only stages done on a machine are machine load (pre-press, review… are not).
    const passes = passesRes.rows.filter((p) => stageMachineTypes(p.workflow_step).length > 0);

    // The plan for the OTs whose passes did not store a machine.
    const needSchedule = [...new Set(passes.filter((p) => !p.machine_id).map((p) => p.ot_id))];
    const scheduleByOt = new Map<string, ScheduleRow[]>();
    for (let i = 0; i < needSchedule.length; i += 100) {
      const { data, error } = await supabaseAdmin
        .from('ot_machine_schedule')
        .select('ot_id, machine_id, plan_step, scheduled_start')
        .in('ot_id', needSchedule.slice(i, i + 100));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const list = scheduleByOt.get(r.ot_id) ?? [];
        list.push(r as ScheduleRow);
        scheduleByOt.set(r.ot_id, list);
      }
    }

    const hoursByMachine = new Map<string, number>();
    const otsByMachine = new Map<string, Set<string>>();
    let unattributed = 0;
    const unattributedByStage = new Map<string, number>();
    for (const p of passes) {
      const candidates = passMachineCandidates({
        workflowStep: p.workflow_step,
        assignedMachineId: p.machine_id,
        machines,
        schedule: scheduleByOt.get(p.ot_id) ?? [],
      });
      // One candidate = that machine. Several or none = not guessed (old passes
      // stored the press for every stage, so the stored id alone is not proof).
      const machineId = candidates.length === 1 ? candidates[0] : null;
      const hours = Number(p.hours) || 0;
      if (!machineId) {
        unattributed += hours;
        const stage = PLAN_STEPS.find((st) => st.status === p.workflow_step)?.label ?? p.workflow_step;
        unattributedByStage.set(stage, (unattributedByStage.get(stage) ?? 0) + hours);
        continue;
      }
      hoursByMachine.set(machineId, (hoursByMachine.get(machineId) ?? 0) + hours);
      const set = otsByMachine.get(machineId) ?? new Set<string>();
      set.add(p.ot_id);
      otsByMachine.set(machineId, set);
    }

    const activeByMachine = new Map<string, number>();
    for (const ot of (otsRes.data ?? []) as Array<{ assigned_machine_id: string | null }>) {
      if (ot.assigned_machine_id) activeByMachine.set(ot.assigned_machine_id, (activeByMachine.get(ot.assigned_machine_id) ?? 0) + 1);
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const rows = machines
      .map((m) => ({
        machine_id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        production_hours: round1(hoursByMachine.get(m.id) ?? 0),
        ots_processed: otsByMachine.get(m.id)?.size ?? 0,
        current_active: activeByMachine.get(m.id) ?? 0,
      }))
      .sort((a, b) => b.production_hours - a.production_hours);

    const totalHours = passes.reduce((s, p) => s + (Number(p.hours) || 0), 0);

    return NextResponse.json({
      window_days: WINDOW_DAYS,
      machines: rows,
      summary: {
        machine_count: machines.length,
        total_production_hours: round1(totalHours),
        unattributed_hours: round1(unattributed),
        unattributed_by_stage: [...unattributedByStage].map(([stage, h]) => ({ stage, hours: round1(h) })).sort((a, b) => b.hours - a.hours),
        producing_now: rows.filter((r) => r.current_active > 0).length,
        active_ots: rows.reduce((s, r) => s + r.current_active, 0),
        busiest: rows[0]?.production_hours ? { name: rows[0].name, hours: rows[0].production_hours } : null,
      },
    });
  } catch (error) {
    console.error('Error in machine activity route:', error);
    return NextResponse.json({ error: 'Failed to fetch machine activity' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ACTIVE_OT_STATUSES = [
  'pre_press',
  'visto_bueno',
  'paper_purchase',
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop',
  'outsourced',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
] as const;

const DEFAULT_SHIFT_HOURS = 9;

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function getWeekStartFromInput(input?: string | null) {
  const base = input ? new Date(`${input}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const day = base.getDay();
  const delta = day === 0 ? -6 : 1 - day; // Monday as week start
  base.setDate(base.getDate() + delta);
  base.setHours(0, 0, 0, 0);
  return base;
}

function buildWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + idx);
    return toIsoDate(date);
  });
}

// GET /api/ot-schedule/week?start=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['supervisor', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requestedStart = searchParams.get('start');
  const weekStartDate = getWeekStartFromInput(requestedStart);

  if (!weekStartDate) {
    return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
  }

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const weekStart = toIsoDate(weekStartDate);
  const weekEnd = toIsoDate(weekEndDate);
  const weekDays = buildWeekDays(weekStartDate);

  const dayStart = `${weekStart}T00:00:00.000Z`;
  const dayEnd = `${weekEnd}T23:59:59.999Z`;

  const [machinesRes, slotsRes, otsRes] = await Promise.all([
    supabaseAdmin
      .from('machines')
      .select('id, name, type, status')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('ot_machine_schedule')
      .select(`
        *,
        ot:ots(
          id, ot_number, client_name, product_name, description,
          quantity, color_front, color_back,
          status, deadline, proceso_actual,
          flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived
        ),
        machine:machines(id, name, type, status)
      `)
      .gte('scheduled_start', dayStart)
      .lte('scheduled_start', dayEnd)
      .order('sort_order', { ascending: true })
      .order('scheduled_start', { ascending: true }),
    supabaseAdmin
      .from('ots')
      .select(`
        id, ot_number, client_name, product_name, description,
        quantity, color_front, color_back,
        status, deadline, proceso_actual,
        flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived,
        workstation:workstations(id, name),
        machine:machines!assigned_machine_id(id, name, type)
      `)
      .in('status', ACTIVE_OT_STATUSES as any)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  const { data: publishedSnapshot, error: publishedErr } = await supabaseAdmin
    .from('week_plan_snapshots')
    .select('id, version, published_at, week_start, week_end')
    .eq('week_start', weekStart)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (machinesRes.error) {
    console.error('Error fetching machines:', machinesRes.error);
    return NextResponse.json({ error: 'Failed to fetch machines' }, { status: 500 });
  }
  if (slotsRes.error) {
    console.error('Error fetching weekly slots:', slotsRes.error);
    return NextResponse.json({ error: 'Failed to fetch weekly schedule' }, { status: 500 });
  }
  if (otsRes.error) {
    console.error('Error fetching active OTs:', otsRes.error);
    return NextResponse.json({ error: 'Failed to fetch active OTs' }, { status: 500 });
  }
  if (publishedErr && publishedErr.code !== '42P01') {
    console.error('Error fetching published snapshot metadata:', publishedErr);
    return NextResponse.json({ error: 'Failed to fetch snapshot metadata' }, { status: 500 });
  }

  const slots = slotsRes.data ?? [];
  const machines = machinesRes.data ?? [];
  const activeOTs = otsRes.data ?? [];

  const scheduledOTIds = new Set<string>(slots.map((slot: any) => slot.ot_id).filter(Boolean));
  const unscheduled = activeOTs.filter((ot: any) => !scheduledOTIds.has(ot.id));

  const slotsByMachineDay = new Map<string, any[]>();
  for (const slot of slots) {
    const machineId = slot.machine_id;
    const dayKey = (slot.scheduled_start ?? '').slice(0, 10);
    const key = `${machineId}__${dayKey}`;
    const current = slotsByMachineDay.get(key) ?? [];
    current.push(slot);
    slotsByMachineDay.set(key, current);
  }

  const machineRows = machines.map((machine: any) => {
    const days = weekDays.map((date) => {
      const key = `${machine.id}__${date}`;
      const daySlots = slotsByMachineDay.get(key) ?? [];
      const plannedHours = daySlots.reduce((acc, slot) => {
        const hours = Number(slot.hours_override ?? slot.estimated_hours ?? 0);
        return acc + (Number.isNaN(hours) ? 0 : hours);
      }, 0);
      return {
        date,
        slots: daySlots,
        planned_hours: Number(plannedHours.toFixed(2)),
        is_overloaded: plannedHours > DEFAULT_SHIFT_HOURS,
      };
    });

    const slotCount = days.reduce((acc, day) => acc + day.slots.length, 0);
    const plannedHoursTotal = days.reduce((acc, day) => acc + day.planned_hours, 0);
    return {
      machine,
      days,
      slot_count: slotCount,
      planned_hours_total: Number(plannedHoursTotal.toFixed(2)),
      overloaded_days: days.filter((d) => d.is_overloaded).length,
    };
  });

  return NextResponse.json({
    week_start: weekStart,
    week_end: weekEnd,
    days: weekDays,
    machine_rows: machineRows,
    unscheduled,
    shift_hours: DEFAULT_SHIFT_HOURS,
    published_snapshot: publishedSnapshot ?? null,
  });
}

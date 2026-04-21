import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function getWeekStartFromInput(input?: string | null) {
  const base = input ? new Date(`${input}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const day = base.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + delta);
  base.setHours(0, 0, 0, 0);
  return base;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['supervisor', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const weekStartDate = getWeekStartFromInput(body?.week_start);

  if (!weekStartDate) {
    return NextResponse.json({ error: 'Invalid week_start' }, { status: 400 });
  }

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const weekStart = toIsoDate(weekStartDate);
  const weekEnd = toIsoDate(weekEndDate);

  const { data: latest, error: latestErr } = await supabaseAdmin
    .from('week_plan_snapshots')
    .select('version')
    .eq('week_start', weekStart)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    console.error('Error reading latest snapshot version:', latestErr);
    return NextResponse.json({ error: 'Failed to read snapshot version' }, { status: 500 });
  }

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: snapshot, error: snapshotErr } = await supabaseAdmin
    .from('week_plan_snapshots')
    .insert({
      week_start: weekStart,
      week_end: weekEnd,
      version: nextVersion,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id, week_start, week_end, version, published_at')
    .single();

  if (snapshotErr || !snapshot) {
    console.error('Error creating week snapshot:', snapshotErr);
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
  }

  const { data: slots, error: slotsErr } = await supabaseAdmin
    .from('ot_machine_schedule')
    .select(`
      id, machine_id, ot_id, sort_order, scheduled_start, scheduled_end, estimated_hours, hours_override, notes,
      ot:ots(
        ot_number, client_name, product_name, description, quantity, color_front, color_back,
        flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived
      )
    `)
    .gte('scheduled_start', `${weekStart}T00:00:00.000Z`)
    .lte('scheduled_start', `${weekEnd}T23:59:59.999Z`)
    .order('sort_order', { ascending: true })
    .order('scheduled_start', { ascending: true });

  if (slotsErr) {
    console.error('Error fetching slots for snapshot:', slotsErr);
    return NextResponse.json({ error: 'Failed to read weekly schedule' }, { status: 500 });
  }

  const lines = (slots ?? []).map((slot: any) => {
    const ot = slot.ot ?? {};
    const productLabel = ot.product_name || ot.description || null;
    const hours = slot.hours_override ?? slot.estimated_hours ?? null;
    return {
      snapshot_id: snapshot.id,
      machine_id: slot.machine_id,
      ot_id: slot.ot_id,
      slot_id: slot.id,
      scheduled_date: (slot.scheduled_start ?? '').slice(0, 10),
      sort_order: slot.sort_order ?? 0,
      scheduled_start: slot.scheduled_start,
      scheduled_end: slot.scheduled_end,
      hours_planned: hours,
      ot_number: ot.ot_number ?? null,
      client_name: ot.client_name ?? null,
      product_label: productLabel,
      quantity: ot.quantity ?? null,
      color_front: ot.color_front ?? null,
      color_back: ot.color_back ?? null,
      flag_ord: !!ot.flag_ord,
      flag_pro: !!ot.flag_pro,
      flag_vbp: !!ot.flag_vbp,
      flag_plan: !!ot.flag_plan,
      flag_paper_arrived: !!ot.flag_paper_arrived,
      notes: slot.notes ?? null,
    };
  });

  if (lines.length > 0) {
    const { error: linesErr } = await supabaseAdmin
      .from('week_plan_snapshot_lines')
      .insert(lines);

    if (linesErr) {
      console.error('Error creating snapshot lines:', linesErr);
      return NextResponse.json({ error: 'Snapshot created but lines failed' }, { status: 500 });
    }
  }

  return NextResponse.json({
    snapshot,
    lines_count: lines.length,
  });
}

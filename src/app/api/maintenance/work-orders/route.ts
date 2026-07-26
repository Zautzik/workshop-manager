import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * A machine is out of service when its maintenance has actually STARTED.
 * Deliberately not 'pending': a work order scheduled for next Tuesday doesn't
 * stop you printing today, and treating it as a block would idle a third of the
 * plant on paper while the presses run fine.
 */
const BLOCKING_STATUSES = ['in_progress'];

/**
 * GET /api/maintenance/work-orders?open=1
 *
 * Answers the question Planta needs: which machines are out of service right
 * now, and which workstations does that take down with them. In a real shop
 * this is law — if the press is opened up, nobody assigns a run to it — but the
 * two modules lived back to back: Equipos never told Planta.
 *
 * `?open=1` returns only what genuinely blocks. Pass `?status=pending,in_progress`
 * to see scheduled work too.
 *
 * Returns workstation ids as well as machine ids, because the plant floor is
 * organised by station and `workstations.machine_id` is the only link between
 * the two.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const openOnly = searchParams.get('open') === '1';
  const statusParam = searchParams.get('status');
  const statuses = statusParam ? statusParam.split(',') : openOnly ? BLOCKING_STATUSES : null;

  let query = supabaseAdmin
    .from('maintenance_work_orders')
    .select('id, machine_id, status, scheduled_date, started_at, machines(name)')
    .order('scheduled_date', { ascending: true });

  if (statuses) query = query.in('status', statuses);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];
  const machineIds = [...new Set(orders.map((o) => o.machine_id).filter(Boolean))] as string[];

  let stations: { id: string; machine_id: string | null; name: string }[] = [];
  if (machineIds.length > 0) {
    const { data: st } = await supabaseAdmin
      .from('workstations')
      .select('id, machine_id, name')
      .in('machine_id', machineIds);
    stations = st ?? [];
  }

  // machine_id → why it's down, so the UI can say more than "unavailable".
  const byMachine: Record<string, { work_order_id: string; status: string; machine_name: string | null; started_at: string | null }> = {};
  for (const o of orders) {
    if (!o.machine_id || byMachine[o.machine_id]) continue;
    const machine = o.machines as { name?: string } | null;
    byMachine[o.machine_id] = {
      work_order_id: o.id,
      status: o.status,
      machine_name: machine?.name ?? null,
      started_at: o.started_at,
    };
  }

  return NextResponse.json({
    orders,
    machine_ids: machineIds,
    workstation_ids: stations.map((s) => s.id),
    by_machine: byMachine,
    by_workstation: Object.fromEntries(
      stations
        .filter((s) => s.machine_id && byMachine[s.machine_id])
        .map((s) => [s.id, { ...byMachine[s.machine_id as string], workstation_name: s.name }])
    ),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

async function buildSnapshotMetrics() {
  const [
    otsTotal,
    otsCompleted,
    otsInProgress,
    employeesTotal,
    activeMachines,
    pendingApprovals,
    todaysOtCreated,
  ] = await Promise.all([
    supabaseAdmin.from('ots').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('ots').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabaseAdmin
      .from('ots')
      .select('id', { count: 'exact', head: true })
      .in('status', ['offset_printing', 'die_cutting', 'workshop', 'in_delivery']),
    supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('machines').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    supabaseAdmin.from('ot_approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin
      .from('ots')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  return {
    ots_total: otsTotal.count ?? 0,
    ots_completed: otsCompleted.count ?? 0,
    ots_in_progress: otsInProgress.count ?? 0,
    employees_total: employeesTotal.count ?? 0,
    machines_active: activeMachines.count ?? 0,
    approvals_pending: pendingApprovals.count ?? 0,
    ots_created_today: todaysOtCreated.count ?? 0,
    generated_at: new Date().toISOString(),
  };
}

// GET /api/reporting/snapshots?latest=true
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const latest = req.nextUrl.searchParams.get('latest') === 'true';
    const db = supabaseAdmin as any;

    let query = db
      .from('reporting_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(latest ? 1 : 30);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching reporting snapshots:', error);
      return NextResponse.json({ error: 'Failed to fetch reporting snapshots' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in reporting snapshots GET:', error);
    return NextResponse.json({ error: 'Failed to fetch reporting snapshots' }, { status: 500 });
  }
}

// POST /api/reporting/snapshots
// Creates or updates today's operational KPI snapshot.
export async function POST(_req: NextRequest) {
  const auth = await requireAuth(['admin']);
  if (isAuthError(auth)) return auth;

  try {
    const metrics = await buildSnapshotMetrics();
    const today = new Date().toISOString().slice(0, 10);
    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from('reporting_snapshots')
      .upsert(
        [{ snapshot_date: today, metrics, generated_by: auth.id }],
        { onConflict: 'snapshot_date' }
      )
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error creating reporting snapshot:', error);
      return NextResponse.json({ error: 'Failed to create reporting snapshot' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in reporting snapshots POST:', error);
    return NextResponse.json({ error: 'Failed to create reporting snapshot' }, { status: 500 });
  }
}

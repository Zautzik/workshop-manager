import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/ots/[id]/history
// Returns the full audited lifecycle of a single OT, reconstructed from
// ot_status_history (written by the transition routes). Each event carries the
// dwell time the OT spent in its *previous* stage, so the client can render a
// timeline with "tiempo por etapa" without recomputing intervals.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const { data: ot, error: otError } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, client_name, status, created_at, description, quantity, deadline')
      .eq('id', id)
      .maybeSingle();

    if (otError) {
      console.error('Error fetching OT for history:', otError);
      return NextResponse.json({ error: 'Failed to fetch OT' }, { status: 500 });
    }
    if (!ot) {
      return NextResponse.json({ error: 'OT not found' }, { status: 404 });
    }

    const { data: rows, error: histError } = await supabaseAdmin
      .from('ot_status_history')
      .select('id, from_status, to_status, changed_by_role, reason, rollback, created_at')
      .eq('ot_id', id)
      .order('created_at', { ascending: true });

    if (histError) {
      console.error('Error fetching OT history:', histError);
      return NextResponse.json({ error: 'Failed to fetch OT history' }, { status: 500 });
    }

    const history = rows ?? [];

    // Walk the timeline and attribute the dwell time to the stage the OT was IN
    // before each transition fired. The very first leg is measured from OT
    // creation; the final (open) leg runs to "now" for in-flight orders.
    const nowMs = Date.now();
    const events = history.map((row, i) => {
      const startMs = i === 0
        ? (ot.created_at ? new Date(ot.created_at).getTime() : new Date(row.created_at).getTime())
        : new Date(history[i - 1].created_at).getTime();
      const endMs = new Date(row.created_at).getTime();
      // The stage that just ENDED is this row's from_status (where it came from).
      return {
        ...row,
        stage_left: row.from_status,
        dwell_hours: Math.max(0, (endMs - startMs) / 3_600_000),
      };
    });

    // Open leg: time the OT has spent in its current status since the last move.
    const lastMoveMs = history.length > 0
      ? new Date(history[history.length - 1].created_at).getTime()
      : (ot.created_at ? new Date(ot.created_at).getTime() : nowMs);
    const currentDwellHours = Math.max(0, (nowMs - lastMoveMs) / 3_600_000);

    return NextResponse.json({
      ot,
      events,
      current_dwell_hours: ot.status === 'completed' ? null : currentDwellHours,
    });
  } catch (error) {
    console.error('Error in OT history route:', error);
    return NextResponse.json({ error: 'Failed to fetch OT history' }, { status: 500 });
  }
}

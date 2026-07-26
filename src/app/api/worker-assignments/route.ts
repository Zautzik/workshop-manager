import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const AssignmentSchema = z.object({
  employee_id: z.string().uuid(),
  workstation_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  date: z.string().min(1),
  role: z.string().min(1),
  ot_id: z.string().uuid().nullable().optional(),
});

const AssignmentBulkSchema = z.array(AssignmentSchema).min(1);

/**
 * GET /api/worker-assignments?date=YYYY-MM-DD
 *     /api/worker-assignments?latest=1   → most recent roster on or before today
 *
 * Returns { date, assignments } where each assignment carries its workstation
 * (name/type) and the OT number. `ot_id` holds an `ots.id` in practice (PlantaBoard
 * writes selectedOT.id); the typed FK still points at the legacy `rosters` table, so
 * resolve the OT number explicitly against `ots` instead of a PostgREST embed.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().split('T')[0];
  const explicitDate = searchParams.get('date');
  const wantsLatest = searchParams.get('latest');
  let date = explicitDate || today;

  // Fall back to the newest roster at or before today so the view is meaningful
  // even when today's roster hasn't been set yet.
  if (wantsLatest && !explicitDate) {
    const { data: latestRow } = await supabaseAdmin
      .from('worker_assignments')
      .select('date')
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRow?.date) date = latestRow.date;
  }

  const { data: rows, error } = await supabaseAdmin
    .from('worker_assignments')
    .select('id, employee_id, workstation_id, ot_id, role, date, shift_id, workstation:workstations(id, name, type)')
    .eq('date', date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assignments = rows ?? [];
  const otIds = Array.from(
    new Set(assignments.map((a: any) => a.ot_id).filter(Boolean))
  ) as string[];

  let otMap = new Map<string, string>();
  if (otIds.length > 0) {
    const { data: ots } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number')
      .in('id', otIds);
    otMap = new Map((ots ?? []).map((o: any) => [o.id, o.ot_number]));
  }

  return NextResponse.json({
    date,
    assignments: assignments.map((a: any) => ({
      ...a,
      ot_number: a.ot_id ? otMap.get(a.ot_id) ?? null : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      const parsed = AssignmentBulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('worker_assignments')
        .insert(parsed.data)
        .select('*');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data ?? []);
    }

    const parsed = AssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('worker_assignments')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const shiftId = searchParams.get('shiftId');

  if (!date || !shiftId) {
    return NextResponse.json(
      { error: 'date and shiftId are required' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('worker_assignments')
    .delete()
    .eq('date', date)
    .eq('shift_id', shiftId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

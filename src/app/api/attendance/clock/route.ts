import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveIdentity, type IdentityMethod } from '@/lib/identity';

// The station device is authenticated; the operator is NOT (login-less) — they
// are identified by badge.

const ClockSchema = z.object({
  method: z.enum(['qr', 'face', 'manual']).default('qr'),
  value: z.string().min(1),
  event_type: z.enum(['clock_in', 'clock_out']).default('clock_in'),
  station_id: z.string().uuid().optional().nullable(),
});

const isMissingTable = (err: { code?: string; message?: string } | null) => {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST204') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('attendance_events') && (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache'));
};

// GET /api/attendance/clock — operators currently present (last event = clock_in)
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;

  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data, error } = await supabaseAdmin
    .from('attendance_events')
    .select('employee_id, event_type, at')
    .gte('at', since.toISOString())
    .order('at', { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ present: [], pending_migration: true });
    return NextResponse.json({ error: 'Failed to read attendance' }, { status: 500 });
  }

  const latest = new Map<string, string>(); // employee_id → latest event_type
  for (const e of (data ?? []) as Array<{ employee_id: string | null; event_type: string }>) {
    if (e.employee_id && !latest.has(e.employee_id)) latest.set(e.employee_id, e.event_type);
  }
  const presentIds = [...latest.entries()].filter(([, t]) => t === 'clock_in').map(([id]) => id);

  let present: Array<{ employee_id: string; full_name: string | null }> = [];
  if (presentIds.length > 0) {
    const { data: emps } = await supabaseAdmin.from('employees').select('id, full_name').in('id', presentIds);
    present = (emps ?? []).map((e) => ({ employee_id: e.id, full_name: e.full_name ?? null }));
  }
  return NextResponse.json({ present });
}

// POST /api/attendance/clock — badge-in / badge-out
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ClockSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { method, value, event_type, station_id } = parsed.data;

    let identity;
    try {
      identity = await resolveIdentity(method as IdentityMethod, value);
    } catch (e) {
      if ((e as Error).message === 'FACE_ADAPTER_NOT_CONFIGURED') {
        return NextResponse.json({ error: 'Reconocimiento facial no configurado' }, { status: 501 });
      }
      throw e;
    }
    if (!identity) {
      return NextResponse.json({ error: 'Operario no reconocido' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from('attendance_events').insert({
      employee_id: identity.employee_id,
      station_id: station_id ?? null,
      event_type,
      method,
      metadata: { by_device: auth.id },
    });

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Fichaje pendiente de activación — aplica la migración attendance_events.' },
          { status: 503 }
        );
      }
      console.error('Error inserting attendance event:', error);
      return NextResponse.json({ error: 'Failed to record attendance' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, employee: identity, event_type, at: new Date().toISOString() }, { status: 201 });
  } catch (error) {
    console.error('Error in attendance clock route:', error);
    return NextResponse.json({ error: 'Failed to record attendance' }, { status: 500 });
  }
}

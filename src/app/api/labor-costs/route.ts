import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  attributeLabor,
  groupLinesByOt,
  laborOperationCode,
  round2,
  type ClockEvent,
  type AssignmentRow,
  type RateRow,
} from '@/lib/labor-attribution';

export const dynamic = 'force-dynamic';

/**
 * Close a production day: turn the kiosk's clock events into real labour cost on
 * each OT. This is the last weld of the Golden Thread — the point where a person
 * scanning a QR at their machine becomes money on the order they produced.
 *
 * GET  ?date=YYYY-MM-DD           → preview: what WOULD be posted (no writes)
 * POST { date }                   → post it, idempotently
 *
 * Idempotency: every line carries a deterministic operation_code
 * (LABOR-<date>-<employee>-<station>) inside workflow_step 'mano_obra'. Posting
 * the same day twice replaces that day's labour rows for the OT rather than
 * stacking a second charge — re-running after a late clock-out correction is
 * safe, which is exactly what a supervisor will do.
 */
const PostSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
  /** Preview without writing — same computation, no side effects. */
  dry_run: z.boolean().optional(),
});

const WORKFLOW_STEP = 'mano_obra';

/** Pull everything the pure engine needs for one day. */
async function loadDay(date: string) {
  // Clock events can cross midnight, so reach a day either side and let the
  // engine pair them; only intervals whose assignment matches `date` get costed.
  const from = new Date(`${date}T00:00:00.000Z`);
  const windowStart = new Date(from.getTime() - 12 * 3600_000).toISOString();
  const windowEnd = new Date(from.getTime() + 36 * 3600_000).toISOString();

  const [eventsRes, assignmentsRes, ratesRes] = await Promise.all([
    supabaseAdmin
      .from('attendance_events')
      .select('employee_id, station_id, at, event_type')
      .gte('at', windowStart)
      .lte('at', windowEnd)
      .order('at', { ascending: true }),
    supabaseAdmin
      .from('worker_assignments')
      .select('employee_id, workstation_id, ot_id, date, role')
      .eq('date', date),
    supabaseAdmin
      .from('compensation_rates')
      .select('employee_id, hourly_rate, currency_code, overtime_multiplier_50, effective_from, effective_to'),
  ]);

  const firstError = eventsRes.error || assignmentsRes.error || ratesRes.error;
  if (firstError) throw new Error(firstError.message);

  return {
    events: (eventsRes.data ?? []) as ClockEvent[],
    assignments: (assignmentsRes.data ?? []) as AssignmentRow[],
    rates: (ratesRes.data ?? []) as RateRow[],
  };
}

async function computeForDate(date: string) {
  const { events, assignments, rates } = await loadDay(date);
  const result = attributeLabor({ date, events, assignments, rates });

  // Names make the preview readable for a supervisor closing the day.
  const employeeIds = [...new Set(result.lines.map((l) => l.employee_id))];
  const otIds = [...new Set(result.lines.map((l) => l.ot_id))];

  const [employeesRes, otsRes] = await Promise.all([
    employeeIds.length
      ? supabaseAdmin.from('employees').select('id, full_name').in('id', employeeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    otIds.length
      ? supabaseAdmin.from('ots').select('id, ot_number').in('id', otIds)
      : Promise.resolve({ data: [] as { id: string; ot_number: string }[] }),
  ]);

  const nameById = new Map((employeesRes.data ?? []).map((e) => [e.id, e.full_name]));
  const otNumberById = new Map((otsRes.data ?? []).map((o) => [o.id, o.ot_number]));

  return {
    ...result,
    lines: result.lines.map((l) => ({
      ...l,
      employee_name: nameById.get(l.employee_id) ?? null,
      ot_number: otNumberById.get(l.ot_id) ?? null,
    })),
    totalCost: round2(result.lines.reduce((s, l) => s + l.cost, 0)),
    totalHours: round2(result.lines.reduce((s, l) => s + l.hours, 0)),
  };
}

/** GET — preview a day without writing anything. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Usa el formato AAAA-MM-DD' }, { status: 400 });
  }

  try {
    const preview = await computeForDate(date);
    return NextResponse.json({ date, posted: false, ...preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: `No se pudo calcular la mano de obra: ${message}` }, { status: 500 });
  }
}

/** POST — post the day's labour cost onto each OT, idempotently. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const parsed = PostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { date, dry_run } = parsed.data;
    const computed = await computeForDate(date);

    if (dry_run) {
      return NextResponse.json({ date, posted: false, ...computed });
    }

    const byOt = groupLinesByOt(computed.lines);
    const postedOts: { ot_id: string; ot_number: string | null; lines: number; cost: number }[] = [];
    const failures: string[] = [];

    for (const [otId, lines] of byOt) {
      const rows = lines.map((line) => {
        const code = laborOperationCode(date, line.employee_id, line.station_id);
        const who = (line as { employee_name?: string | null }).employee_name || 'Operario';
        const overtimeNote =
          line.overtimeHours > 0 ? ` (incluye ${line.overtimeHours} h extra)` : '';
        return {
          ot_id: otId,
          workflow_step: WORKFLOW_STEP,
          operation_code: code,
          description: `Mano de obra — ${who}${overtimeNote}`,
          category: 'impresion',
          quantity: line.hours,
          unit: 'hrs',
          unit_cost: line.hourlyRate,
          recorded_by: userId,
          notes: `Turno del ${date}. ${line.regularHours} h normales${
            line.overtimeHours > 0 ? ` + ${line.overtimeHours} h extra ×${(line.cost / Math.max(line.hours * line.hourlyRate, 1)).toFixed(2)}` : ''
          }. Costo calculado: ${line.cost} ${line.currency}.`,
        };
      });

      // Idempotent replace, insert-first (same contract as /api/ots/[id]/real-costs):
      // a failed insert leaves the previous rows intact; the worst case is a
      // visible duplicate, never a silent loss of the day's cost.
      const codes = rows.map((r) => r.operation_code);
      const { data: previous } = await supabaseAdmin
        .from('ot_real_costs')
        .select('id')
        .eq('ot_id', otId)
        .eq('workflow_step', WORKFLOW_STEP)
        .in('operation_code', codes);
      const previousIds = (previous ?? []).map((p) => p.id);

      const { error: insertError } = await supabaseAdmin.from('ot_real_costs').insert(rows);
      if (insertError) {
        failures.push(`OT ${otId}: ${insertError.message}`);
        continue;
      }

      if (previousIds.length > 0) {
        const { error: cleanupError } = await supabaseAdmin
          .from('ot_real_costs')
          .delete()
          .in('id', previousIds);
        if (cleanupError) {
          console.error('Labor cost cleanup failed (duplicates remain):', cleanupError);
          failures.push(`OT ${otId}: quedaron filas duplicadas del cálculo anterior`);
        }
      }

      postedOts.push({
        ot_id: otId,
        ot_number: (lines[0] as { ot_number?: string | null }).ot_number ?? null,
        lines: rows.length,
        cost: round2(lines.reduce((s, l) => s + l.cost, 0)),
      });
    }

    return NextResponse.json({
      date,
      posted: true,
      ots: postedOts,
      totalCost: computed.totalCost,
      totalHours: computed.totalHours,
      unattributedHours: computed.unattributedHours,
      warnings: computed.warnings,
      ...(failures.length ? { failures } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: `No se pudo cerrar el día: ${message}` }, { status: 500 });
  }
}

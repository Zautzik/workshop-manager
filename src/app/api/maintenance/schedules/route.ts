import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { evaluateSchedule, compareDue } from '@/lib/maintenance-due';

export const dynamic = 'force-dynamic';

/**
 * GET /api/maintenance/schedules
 *
 * `maintenance_schedules` tenía 12 pautas cargadas y CERO referencias en todo
 * el código: nada las leía, así que ninguna pantalla decía nunca que un
 * mantenimiento estaba vencido. Lo que sí se mostraba en "Programa" es
 * `maintenance_programs`, que son otra cosa —documentos de manual, sin
 * frecuencia— y quedaron con el mismo nombre.
 *
 * Acá se evalúa cada pauta por los dos caminos: calendario y uso. Vence lo que
 * ocurra primero, que es como funciona una máquina de verdad.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const machineId = new URL(req.url).searchParams.get('machine_id');

  let query = supabaseAdmin
    .from('maintenance_schedules')
    .select(`
      *,
      machines ( id, name, type, usage_unit, usage_counter ),
      machine_systems ( id, code, name )
    `);

  if (machineId) query = query.eq('machine_id', machineId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: rates } = await supabaseAdmin.from('machine_usage_rate_v').select('machine_id, uso_por_dia');
  const rateByMachine = new Map((rates ?? []).map((r) => [r.machine_id, r.uso_por_dia]));

  const evaluated = (data ?? []).map((s) => {
    const machine = s.machines as {
      id: string; name: string; usage_unit: string; usage_counter: number | null;
    } | null;

    return {
      ...s,
      machine_name: machine?.name ?? null,
      usage_unit: machine?.usage_unit ?? 'hours',
      due: evaluateSchedule({
        frequencyDays: s.frequency_days,
        nextMaintenanceDate: s.next_maintenance_date,
        frequencyUsage: s.frequency_usage,
        lastMaintenanceUsage: s.last_maintenance_usage,
        usageCounter: machine?.usage_counter ?? null,
        usagePerDay: machine ? rateByMachine.get(machine.id) ?? null : null,
      }),
    };
  });

  evaluated.sort((a, b) => compareDue(a.due, b.due));

  return NextResponse.json({
    schedules: evaluated,
    summary: {
      total: evaluated.length,
      vencidas: evaluated.filter((s) => s.due.status === 'vencida').length,
      proximas: evaluated.filter((s) => s.due.status === 'proxima').length,
      sin_datos: evaluated.filter((s) => s.due.status === 'sin_datos').length,
      // Cuántas se programan por uso: si es cero, el contador no está haciendo
      // nada por el mantenimiento preventivo todavía.
      por_uso: evaluated.filter((s) => s.frequency_usage).length,
    },
  });
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  machine_id: z.string().uuid(),
  maintenance_type: z.enum(['preventive', 'corrective', 'emergency', 'inspection', 'cleaning']),
  description: z.string().max(2000).nullable().optional(),
  frequency_days: z.coerce.number().int().min(0).optional(),
  /** Cada cuánto uso vence, en la unidad de LA máquina. */
  frequency_usage: z.coerce.number().min(0).nullable().optional(),
  system_id: z.string().uuid().nullable().optional(),
  estimated_duration_hours: z.coerce.number().min(0).nullable().optional(),
  next_maintenance_date: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = UpsertSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pauta inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { id, ...rest } = parsed.data;

    // Una pauta que no vence ni por fecha ni por uso no es una pauta.
    if (!rest.frequency_days && !rest.frequency_usage) {
      return NextResponse.json(
        { error: 'La pauta necesita una frecuencia: por días, por uso, o ambas.' },
        { status: 400 }
      );
    }

    const payload = {
      ...rest,
      next_maintenance_date:
        rest.next_maintenance_date ??
        new Date(Date.now() + (rest.frequency_days ?? 30) * 86_400_000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = id
      ? await supabaseAdmin.from('maintenance_schedules').update(payload).eq('id', id).select('*').single()
      : await supabaseAdmin.from('maintenance_schedules').insert(payload).select('*').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: id ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar la pauta' }, { status: 500 });
  }
}

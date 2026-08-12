import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { rollupCosts, type CostLine } from '@/lib/cost-rollup';
import { evaluateAlarm, actionableAlarms, summarizeAlarms } from '@/lib/cost-alarms';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;
const THRESHOLD_KEY = 'cost_overrun_threshold_pct';
const DEFAULT_THRESHOLD = 15;

async function readThreshold(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('app_settings' as any)
    .select('value')
    .eq('key', THRESHOLD_KEY)
    .maybeSingle();
  const v = Number((data as any)?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_THRESHOLD;
}

const MARGIN_FLOOR_KEY = 'min_margin_pct';
const DEFAULT_MARGIN_FLOOR = 10;

async function readMarginFloor(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', MARGIN_FLOOR_KEY)
    .maybeSingle();
  const v = Number((data as { value?: unknown } | null)?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MARGIN_FLOOR;
}

/**
 * GET /api/cost-alerts — los trabajos que exigen una mirada.
 *
 * Antes medía UNA sola cosa: costo real contra costo estimado. Eso detecta que
 * se presupuestó mal, que es un problema de proceso. No detectaba lo que de
 * verdad duele: que el trabajo COSTÓ MÁS DE LO QUE SE COBRÓ. Un trabajo puede
 * estar perfectamente dentro del presupuesto y aun así sacar plata del bolsillo,
 * si el presupuesto ya era más alto que el precio.
 *
 * Ahora pregunta las dos cosas, y no alarma sobre OTs sin costo real cargado:
 * ahí el margen aritmético es 100% y gritar "excelente" sería tan falso como
 * gritar "pérdida".
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const [overrunPct, minMarginPct] = await Promise.all([readThreshold(), readMarginFloor()]);

  const { data: ots, error: otsError } = await supabaseAdmin
    .from('ots')
    .select('id, ot_number, client_name, total_price');
  if (otsError) return NextResponse.json({ error: otsError.message }, { status: 500 });

  const otIds = (ots ?? []).map((o) => o.id);
  // Paginado: las mismas 4.256 líneas que truncaban la pantalla de Rentabilidad.
  const { rows: lines } = otIds.length
    ? await fetchAll<any>((desde, hasta) =>
        supabaseAdmin
          .from('ot_cost_lines')
          .select('ot_id, kind, category, total, source')
          .in('ot_id', otIds)
          .range(desde, hasta) as any,
      )
    : { rows: [] as any[] };

  // Mismo motor que la analítica: una sola verdad de costo, sin lo sembrado.
  const rollup = rollupCosts((lines ?? []) as CostLine[], (ots ?? []).map((o) => ({
    ot_id: o.id, ot_number: o.ot_number, client_name: o.client_name, revenue: o.total_price,
  })));

  const alarms = rollup.map((r) =>
    evaluateAlarm(
      {
        ot_id: r.ot_id, ot_number: r.ot_number, client_name: r.client_name,
        revenue: r.revenue, estimated_cost: r.estimated_cost,
        actual_cost: r.actual_cost, unreliable: r.unreliable,
      },
      { overrunPct, minMarginPct }
    )
  );

  const accionables = actionableAlarms(alarms);

  return NextResponse.json({
    thresholds: { overrunPct, minMarginPct },
    // Compatibilidad con quien ya leía `threshold` y `alerts`.
    threshold: overrunPct,
    count: accionables.length,
    alerts: accionables,
    summary: summarizeAlarms(alarms),
  });
}

const PatchSchema = z.object({
  threshold: z.coerce.number().min(0).max(500).optional(),
  min_margin_pct: z.coerce.number().min(0).max(100).optional(),
});

/** PATCH — umbral de sobrecosto y/o piso de margen (admin/manager). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.threshold == null && parsed.data.min_margin_pct == null)) {
    return NextResponse.json(
      { error: 'Envía al menos uno: threshold (% de sobrecosto) o min_margin_pct (piso de margen).' },
      { status: 400 }
    );
  }

  const rows: Array<{ key: string; value: number }> = [];
  if (parsed.data.threshold != null) rows.push({ key: THRESHOLD_KEY, value: parsed.data.threshold });
  if (parsed.data.min_margin_pct != null) rows.push({ key: MARGIN_FLOOR_KEY, value: parsed.data.min_margin_pct });

  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert(rows as never, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    threshold: parsed.data.threshold ?? (await readThreshold()),
    min_margin_pct: parsed.data.min_margin_pct ?? (await readMarginFloor()),
  });
}

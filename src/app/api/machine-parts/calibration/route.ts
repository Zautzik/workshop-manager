import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { computePartCalibration, type PartCalibrationReading } from '@/lib/part-calibration';

export const dynamic = 'force-dynamic';

/** Deviación tolerable antes de considerar la estimación desajustada -- mismo criterio que /analitica/calibracion. */
const TOLERANCE_PCT = 10;

/**
 * GET /api/machine-parts/calibration
 *
 * ¿La vida útil que le pusimos a cada pieza (`expected_life_usage`) se
 * parece a lo que de verdad dura antes de fallar? La lógica vive en
 * part-calibration.ts (testeada); acá sólo se traen los dos insumos que
 * necesita -- piezas con vida esperada, y sus órdenes correctivas cerradas
 * con lectura de uso -- y se arma el resumen.
 */
export async function GET() {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { data: parts, error: partsError } = await supabaseAdmin
    .from('machine_parts')
    .select('id, name, machine_id, expected_life_usage, last_replaced_usage, last_replaced_at, machines(name, usage_unit)')
    .eq('is_active', true)
    .not('expected_life_usage', 'is', null);

  if (partsError) {
    return NextResponse.json({ error: partsError.message }, { status: 500 });
  }

  const partIds = (parts ?? []).map((p) => p.id);
  if (partIds.length === 0) {
    return NextResponse.json({ readings: [], summary: { total: 0, within_tolerance: 0, under: 0, over: 0 } });
  }

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('maintenance_work_orders')
    .select('id, part_id, usage_at_creation, created_at')
    .eq('work_order_type', 'correctivo')
    .eq('status', 'completed')
    .in('part_id', partIds)
    .not('usage_at_creation', 'is', null)
    .order('created_at', { ascending: true });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const readings = computePartCalibration(
    (parts ?? []).map((p) => {
      const machine = p.machines as { name: string; usage_unit: string } | null;
      return {
        id: p.id,
        name: p.name,
        machineId: p.machine_id,
        machineName: machine?.name ?? 'Máquina',
        usageUnit: machine?.usage_unit ?? 'hours',
        expectedLifeUsage: p.expected_life_usage,
        lastReplacedUsage: p.last_replaced_usage,
        lastReplacedAt: p.last_replaced_at,
      };
    }),
    (orders ?? []).map((o) => ({
      id: o.id,
      partId: o.part_id as string,
      usageAtCreation: o.usage_at_creation,
      createdAt: o.created_at as string,
    })),
  );

  readings.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  const summary = readings.reduce(
    (acc, r) => {
      acc.total += 1;
      if (Math.abs(r.deltaPct) <= TOLERANCE_PCT) acc.within_tolerance += 1;
      else if (r.deltaPct < 0) acc.under += 1;
      else acc.over += 1;
      return acc;
    },
    { total: 0, within_tolerance: 0, under: 0, over: 0 },
  );

  return NextResponse.json({ readings, summary, tolerance_pct: TOLERANCE_PCT } satisfies {
    readings: PartCalibrationReading[];
    summary: typeof summary;
    tolerance_pct: number;
  });
}

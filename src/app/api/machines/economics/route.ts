import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  deriveMachineHourlyCost,
  compareToCatalog,
  DEFAULT_MONTHLY_PRODUCTIVE_HOURS,
} from '@/lib/machine-economics';
import { machineHourRate } from '@/lib/costing-resolver';
import { DEFAULT_COSTS } from '@/lib/ot-calculations';
import type { CostCenterItem } from '@/types/work-category';

export const dynamic = 'force-dynamic';

/**
 * GET /api/machines/economics?hours=195
 *
 * What each machine really costs per hour, next to what the ledger charges for
 * an hour on it. The two numbers lived in different modules and were never
 * compared, so a quote could drift from reality with nothing to show for it.
 *
 * The charged rate comes from `machineHourRate` — the same resolution that
 * values a closed stage pass (stage-valuation.ts). This route used to look the
 * rate up on its own and ended up comparing every machine against the press
 * operator's wage; one resolver means the screen and the ledger cannot disagree.
 *
 * Reporting only — this does not change any price. Making the gap visible is
 * the point; deciding what to do about it is the owner's call.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const hours =
    Math.max(1, Number(searchParams.get('hours') ?? DEFAULT_MONTHLY_PRODUCTIVE_HOURS) || DEFAULT_MONTHLY_PRODUCTIVE_HOURS);

  const [machinesRes, catalogRes] = await Promise.all([
    supabaseAdmin
      .from('machines')
      .select(
        'id, name, type, status, colors, energy_cost_per_hr, maintenance_cost_monthly, depreciation_monthly, power_kw, nominal_speed_sheets_hr'
      )
      .eq('is_active', true)
      .order('name'),
    supabaseAdmin.from('cost_catalog').select('id, catalog_key, name, category, unit, unit_cost, is_active'),
  ]);

  // A failed catalog read used to fall through to a hard-coded rate, so the
  // screen showed a confident comparison against a number nobody had set.
  const failed = machinesRes.error ?? catalogRes.error;
  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 500 });
  }

  const catalog = (catalogRes.data ?? []) as unknown as CostCenterItem[];

  // One currency (CLP) since migration 20260726150000, so machine economics and
  // the catalog are directly comparable.
  const machines = (machinesRes.data ?? []).map((m) => {
    const derived = deriveMachineHourlyCost(m, hours);
    const charged = machineHourRate({ type: String(m.type), colors: m.colors }, catalog, DEFAULT_COSTS);
    return {
      machine_id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      derived_hourly: derived.hourly,
      breakdown: derived.breakdown,
      data_complete: derived.complete,
      missing_fields: derived.missing,
      // null = this machine type is not charged per machine-hour in the ledger.
      charged_hourly: charged?.rate ?? null,
      charged_label: charged?.label ?? null,
      // 'supuesto' = the catalog has no rate and the engine default was used.
      charged_source: charged?.source ?? null,
      drift: charged ? compareToCatalog(derived.hourly, charged.rate) : null,
    };
  });

  const measurable = machines.filter((m) => m.data_complete && m.drift);

  return NextResponse.json({
    monthly_productive_hours: hours,
    machines,
    currency: 'CLP',
    summary: {
      total: machines.length,
      with_complete_economics: measurable.length,
      // The dangerous side: the machine costs more than we charge for it.
      undercharging: measurable.filter((m) => m.drift?.direction === 'under').length,
      overcharging: measurable.filter((m) => m.drift?.direction === 'over').length,
      aligned: measurable.filter((m) => m.drift?.direction === 'aligned').length,
      not_charged_hourly: machines.filter((m) => !m.drift).length,
    },
  });
}

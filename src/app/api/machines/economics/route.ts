import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  deriveMachineHourlyCost,
  compareToCatalog,
  DEFAULT_MONTHLY_PRODUCTIVE_HOURS,
} from '@/lib/machine-economics';

export const dynamic = 'force-dynamic';

interface CatalogRow {
  catalog_key: string | null;
  name: string | null;
  unit_cost: number;
  is_active: boolean | null;
}

/** Catalog rows that represent an HOUR of press time (never a per-click rate). */
const PRESS_RATE_KEYS = ['offset_print_per_hour', 'impresion_offset', 'operador_prensa'];
/** Engine fallback when the catalog has nothing — mirrors production-costs.ts. */
const FALLBACK_PRESS_RATE = 55000;

/**
 * GET /api/machines/economics?hours=195
 *
 * What each machine really costs per hour, next to what the costing catalog
 * charges for it. The two numbers lived in different modules and were never
 * compared, so a quote could drift from reality with nothing to show for it.
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
        'id, name, type, status, energy_cost_per_hr, maintenance_cost_monthly, depreciation_monthly, power_kw, nominal_speed_sheets_hr'
      )
      .eq('is_active', true)
      .order('name'),
    supabaseAdmin.from('cost_catalog' as any).select('catalog_key, name, unit_cost, is_active'),
  ]);

  if (machinesRes.error) {
    return NextResponse.json({ error: machinesRes.error.message }, { status: 500 });
  }

  // Match by stable catalog_key only. A fuzzy name match here picked up
  // "Impresión Digital" — a per-CLICK rate of 595 — and silently compared it to
  // an hourly cost. Wrong unit is worse than no answer.
  const catalogRows = ((catalogRes.data ?? []) as unknown as CatalogRow[]).filter(
    (c) => c.is_active !== false
  );
  const catalogRate =
    catalogRows.find((c) => c.catalog_key && PRESS_RATE_KEYS.includes(String(c.catalog_key)))?.unit_cost ??
    FALLBACK_PRESS_RATE;

  // One currency (CLP) since migration 20260726150000, so machine economics and
  // the catalog are directly comparable. Before that the schema mixed USD wages
  // with a CLP catalog — the same number ~950× apart — and any "drift %" across
  // that gap was noise dressed as a finding.
  const machines = (machinesRes.data ?? []).map((m) => {
    const derived = deriveMachineHourlyCost(m, hours);
    const drift = compareToCatalog(derived.hourly, Number(catalogRate));
    return {
      machine_id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      derived_hourly: derived.hourly,
      breakdown: derived.breakdown,
      data_complete: derived.complete,
      missing_fields: derived.missing,
      drift,
    };
  });

  const measurable = machines.filter((m) => m.data_complete);

  return NextResponse.json({
    monthly_productive_hours: hours,
    catalog_hourly: Number(catalogRate),
    machines,
    currency: 'CLP',
    summary: {
      total: machines.length,
      with_complete_economics: measurable.length,
      // The dangerous side: the machine costs more than we charge for it.
      undercharging: measurable.filter((m) => m.drift?.direction === 'under').length,
      overcharging: measurable.filter((m) => m.drift?.direction === 'over').length,
      aligned: measurable.filter((m) => m.drift?.direction === 'aligned').length,
    },
  });
}

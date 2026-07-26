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

  // ── Currency guard ───────────────────────────────────────────────────────
  // This database stores money in two currencies and says so nowhere:
  //   · compensation_rates carries currency_code = 'USD' (a press operator = 16)
  //   · cost_catalog is plainly CLP  (the same operator = 8.500/hr)
  // Those are the SAME wage, ~950× apart. Publishing a "drift %" across that gap
  // would be pure noise dressed as a finding, so the comparison is only made
  // when the caller states the basis explicitly (?fx=<CLP per unit of machine
  // currency>). Without it we report the derived cost and stay silent on drift.
  const fxParam = searchParams.get('fx');
  const fx = fxParam ? Number(fxParam) : null;
  const comparable = fx !== null && Number.isFinite(fx) && fx > 0;

  const machines = (machinesRes.data ?? []).map((m) => {
    const derived = deriveMachineHourlyCost(m, hours);
    const drift = comparable
      ? compareToCatalog(derived.hourly * (fx as number), Number(catalogRate))
      : null;
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
    currency_basis: comparable
      ? { fx, note: 'Costos de máquina convertidos con el fx indicado antes de comparar.' }
      : {
          fx: null,
          note:
            'Sin comparación: los costos de máquina y el catálogo están en monedas distintas (compensation_rates usa USD, cost_catalog usa CLP). Pasa ?fx=<CLP por unidad> para habilitar el desvío.',
        },
    summary: {
      total: machines.length,
      with_complete_economics: measurable.length,
      undercharging: comparable ? measurable.filter((m) => m.drift?.direction === 'under').length : null,
      overcharging: comparable ? measurable.filter((m) => m.drift?.direction === 'over').length : null,
      aligned: comparable ? measurable.filter((m) => m.drift?.direction === 'aligned').length : null,
    },
  });
}

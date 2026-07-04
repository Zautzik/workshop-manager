/**
 * Resolve the estimate engine's cost keys from the shared DB cost catalog and
 * real purchase-weighted material costs (COST layer 3b). Deterministic: catalog
 * lines are matched by category + their known names (the seed catalog), and the
 * offset rate is chosen by colour count. Unmatched keys keep the engine default,
 * so a renamed/removed catalog line degrades safely rather than mis-pricing.
 */
import type { CostCenterItem } from '@/types/work-category';
import type { CostOverrides } from '@/lib/ot-calculations';
import type { MaterialCost } from '@/hooks/use-cost-catalog';

export interface CostSpec {
  color_front: string;
  color_back: string;
  substrate_type: string;
  grammage_gsm: number;
}

const COLOR_COUNT: Record<string, number> = {
  cmyk: 4, cmyk_pantone: 5, '3_color': 3, '2_color': 2, '1_color': 1, sin_impresion: 0,
};

// Catalog line name → engine cost key (per-hour rates, exact match on the seed).
const NAME_TO_KEY: Record<string, keyof CostOverrides> = {
  'Corte Final (Guillotina)': 'cut_per_hour',
  'Corte Resma (Guillotina)': 'cut_per_hour',
  'Troquelado': 'troquelado_per_hour',
  'Doblado': 'plegado_per_hour',
  'Pegado Automático': 'pegado_per_hour',
  'Perforado': 'perforado_per_hour',
  'Hot Stamping': 'hot_stamping_per_hour',
  'UV Localizado': 'uv_localizado_per_hour',
  'Numeración': 'numeracion_per_hour',
};

const OFFSET_BY_COLORS: Record<number, string> = {
  1: 'Offset 1 Color', 2: 'Offset 2 Colores', 3: 'Offset 4 Colores',
  4: 'Offset 4 Colores', 5: 'Offset 4 Colores',
};

// OT substrate_type → catalog/inventory name keyword.
const SUBSTRATE_KEYWORD: Record<string, string> = {
  couche: 'couch', cauche: 'couch', bond: 'bond', cartulina: 'cartulina',
  kraft: 'kraft', adhesivo: 'adhesiv',
};

function grammageOf(name: string): number | null {
  const m = name.match(/(\d{2,4})\s*(?:grs|gsm|g)?/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Best material cost (real weighted when lots exist, else catalog) for a substrate spec. */
function resolveSubstrateCost(
  keyword: string | undefined,
  grammage: number,
  catalog: CostCenterItem[],
  materialCost?: MaterialCost[]
): number | undefined {
  if (!keyword) return undefined;
  const closest = <T extends { name: string }>(rows: T[]): T | undefined => {
    const matches = rows.filter((r) => r.name.toLowerCase().includes(keyword));
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) =>
      Math.abs((grammageOf(a.name) ?? 1e9) - grammage) - Math.abs((grammageOf(b.name) ?? 1e9) - grammage)
    )[0];
  };

  // Prefer the real purchase-weighted cost when a matching material has lots.
  const real = closest((materialCost ?? []).filter((m) => m.lot_count > 0));
  if (real) return Number(real.weighted_cost);

  const cat = closest(catalog.filter((c) => c.category === 'papel' && c.is_active));
  return cat ? cat.unit_cost : undefined;
}

/**
 * Build the engine cost overrides for a spec. Only sets keys it can resolve;
 * everything else falls back to the engine's DEFAULT_COSTS.
 */
export function resolveCostOverrides(
  catalog: CostCenterItem[],
  spec: CostSpec,
  materialCost?: MaterialCost[]
): CostOverrides {
  const active = catalog.filter((c) => c.is_active);
  const byName = new Map(active.map((c) => [c.name, c.unit_cost]));
  const out: CostOverrides = {};

  // Machine + finishing per-hour rates by exact catalog name.
  for (const [name, key] of Object.entries(NAME_TO_KEY)) {
    const v = byName.get(name);
    if (v != null) out[key] = v;
  }

  // Offset press rate by colour count (max of front/back).
  const colors = Math.max(COLOR_COUNT[spec.color_front] ?? 0, COLOR_COUNT[spec.color_back] ?? 0);
  const offsetName = OFFSET_BY_COLORS[colors];
  if (offsetName && byName.get(offsetName) != null) out.offset_print_per_hour = byName.get(offsetName)!;

  // Plates.
  const plate = active.find((c) => c.category === 'planchas');
  if (plate) out.plate_per_unit = plate.unit_cost;

  // Ink (CMYK offset by default; catalog line if present).
  const ink = byName.get('Tinta Offset CMYK');
  if (ink != null) out.ink_per_kg = ink;

  // Substrate — real purchase-weighted cost when available, else catalog papel.
  const substrateCost = resolveSubstrateCost(
    SUBSTRATE_KEYWORD[spec.substrate_type],
    spec.grammage_gsm,
    active,
    materialCost
  );
  if (substrateCost != null) out.substrate_per_kg = substrateCost;

  return out;
}

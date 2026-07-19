/**
 * Resolve the estimate engine's cost keys from the shared DB cost catalog and
 * real purchase-weighted material costs (COST layer 3b).
 *
 * v2 (demo plan §6.3): rates are matched by STABLE catalog_key first — a
 * renamed catalog line no longer silently drops a quote back to the engine's
 * toy defaults (the audit's "3.4× mispricing bomb"). Legacy exact-name
 * matching remains as fallback for rows without a key. Unresolvable keys keep
 * DEFAULT_COSTS, so the engine always prices something.
 *
 * Also maps labor (Operador de Prensa / Terminaciones) and the overhead %
 * line — the engine now quotes them (audit OF-20).
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

/** Stable catalog_key → engine cost key (migration 20260719120000 seeds them). */
const KEY_TO_ENGINE: Record<string, keyof CostOverrides> = {
  corte_guillotina: 'cut_per_hour',
  troquelado: 'troquelado_per_hour',
  doblado: 'plegado_per_hour',
  pegado_automatico: 'pegado_per_hour',
  laminado: 'laminado_per_hour',
  barniz: 'barniz_per_hour',
  relieve: 'relieve_per_hour',
  perforado: 'perforado_per_hour',
  hot_stamping: 'hot_stamping_per_hour',
  uv_localizado: 'uv_localizado_per_hour',
  numeracion: 'numeracion_per_hour',
  plancha_ctp: 'plate_per_unit',
  tinta_cmyk: 'ink_per_kg',
  operador_prensa: 'press_labor_per_hour',
  operador_terminaciones: 'finish_labor_per_hour',
  overhead_general: 'overhead_pct',
};

/** Legacy fallback: exact seed names (rows created before catalog_key). */
const NAME_TO_KEY: Record<string, keyof CostOverrides> = {
  'Corte Final (Guillotina)': 'cut_per_hour',
  'Corte Resma (Guillotina)': 'cut_per_hour',
  'Troquelado': 'troquelado_per_hour',
  'Doblado': 'plegado_per_hour',
  'Pegado Automático': 'pegado_per_hour',
  'Laminado': 'laminado_per_hour',
  'Barniz UV': 'barniz_per_hour',
  'Perforado': 'perforado_per_hour',
  'Hot Stamping': 'hot_stamping_per_hour',
  'UV Localizado': 'uv_localizado_per_hour',
  'Numeración': 'numeracion_per_hour',
  'Operador de Prensa': 'press_labor_per_hour',
  'Operador de Terminaciones': 'finish_labor_per_hour',
};

const OFFSET_KEY_BY_COLORS: Record<number, string> = {
  1: 'offset_1c', 2: 'offset_2c', 3: 'offset_4c', 4: 'offset_4c', 5: 'offset_4c',
};
const OFFSET_NAME_BY_COLORS: Record<number, string> = {
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
  const byKey = new Map(active.filter((c) => c.catalog_key).map((c) => [c.catalog_key as string, c.unit_cost]));
  const byName = new Map(active.map((c) => [c.name, c.unit_cost]));
  const out: CostOverrides = {};

  // Stable keys first; legacy names fill anything still unset.
  for (const [key, engineKey] of Object.entries(KEY_TO_ENGINE)) {
    const v = byKey.get(key);
    if (v != null) out[engineKey] = v;
  }
  for (const [name, engineKey] of Object.entries(NAME_TO_KEY)) {
    if (out[engineKey] == null) {
      const v = byName.get(name);
      if (v != null) out[engineKey] = v;
    }
  }

  // Offset press rate by colour count (max of front/back), key → name.
  const colors = Math.max(COLOR_COUNT[spec.color_front] ?? 0, COLOR_COUNT[spec.color_back] ?? 0);
  const offsetRate = byKey.get(OFFSET_KEY_BY_COLORS[colors] ?? '') ?? byName.get(OFFSET_NAME_BY_COLORS[colors] ?? '');
  if (offsetRate != null) out.offset_print_per_hour = offsetRate;

  // Plates: key → category fallback.
  if (out.plate_per_unit == null) {
    const plate = active.find((c) => c.category === 'planchas');
    if (plate) out.plate_per_unit = plate.unit_cost;
  }

  // Ink: key → legacy name.
  if (out.ink_per_kg == null) {
    const ink = byName.get('Tinta Offset CMYK');
    if (ink != null) out.ink_per_kg = ink;
  }

  // Overhead: key → first overhead-category row (unit_cost stores the %).
  if (out.overhead_pct == null) {
    const oh = active.find((c) => c.category === 'overhead');
    if (oh) out.overhead_pct = oh.unit_cost;
  }

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

import { describe, it, expect } from 'vitest';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import type { CostCenterItem } from '@/types/work-category';
import type { MaterialCost } from '@/hooks/use-cost-catalog';

const cat = (name: string, category: string, unit_cost: number, is_active = true): CostCenterItem =>
  ({ id: name, name, category: category as CostCenterItem['category'], unit: 'hrs', unit_cost, is_active });

const CATALOG: CostCenterItem[] = [
  cat('Offset 1 Color', 'impresion', 35000),
  cat('Offset 2 Colores', 'impresion', 55000),
  cat('Offset 4 Colores', 'impresion', 85000),
  cat('Corte Final (Guillotina)', 'guillotina', 18000),
  cat('Troquelado', 'terminaciones', 25000),
  cat('Plancha CTP', 'planchas', 8500),
  cat('Tinta Offset CMYK', 'tinta', 31915),
  cat('Couché 170 grs', 'papel', 2000),
  cat('Cartulina 350 grs', 'papel', 3000),
];

const SPEC = { color_front: 'cmyk', color_back: 'sin_impresion', substrate_type: 'couche', grammage_gsm: 170 };

describe('resolveCostOverrides', () => {
  it('picks the offset rate by colour count (cmyk → 4 colours)', () => {
    expect(resolveCostOverrides(CATALOG, SPEC).offset_print_per_hour).toBe(85000);
  });

  it('picks the 1-colour offset rate for a 1-colour job', () => {
    const o = resolveCostOverrides(CATALOG, { ...SPEC, color_front: '1_color' });
    expect(o.offset_print_per_hour).toBe(35000);
  });

  it('maps finishing + cut + plate + ink by catalog name', () => {
    const o = resolveCostOverrides(CATALOG, SPEC);
    expect(o.cut_per_hour).toBe(18000);
    expect(o.troquelado_per_hour).toBe(25000);
    expect(o.plate_per_unit).toBe(8500);
    expect(o.ink_per_kg).toBe(31915);
  });

  it('resolves substrate by type + closest grammage from the catalog', () => {
    const o = resolveCostOverrides(CATALOG, { ...SPEC, substrate_type: 'couche', grammage_gsm: 170 });
    expect(o.substrate_per_kg).toBe(2000); // Couché 170 grs
    const o2 = resolveCostOverrides(CATALOG, { ...SPEC, substrate_type: 'cartulina', grammage_gsm: 350 });
    expect(o2.substrate_per_kg).toBe(3000); // Cartulina 350 grs
  });

  it('prefers real purchase-weighted cost over the catalog when lots exist', () => {
    const material: MaterialCost[] = [{
      item_id: '1', sku: 'CAR-350', name: 'Cartulina C1S 350gsm', unit: 'kg', category: 'papel',
      estimated_unit_cost: 3000, weighted_cost: 3450, lot_count: 3, total_received: 5000,
      latest_cost: 3500, latest_received: '2026-06-01',
    }];
    const o = resolveCostOverrides(CATALOG, { ...SPEC, substrate_type: 'cartulina', grammage_gsm: 350 }, material);
    expect(o.substrate_per_kg).toBe(3450); // real weighted, not catalog 3000
  });

  it('leaves unmatched keys unset (engine keeps its default)', () => {
    const o = resolveCostOverrides(CATALOG, SPEC);
    expect(o.laminado_per_hour).toBeUndefined(); // no hr-based laminado line in catalog
  });

  it('ignores inactive catalog lines', () => {
    const withInactive = CATALOG.map((c) => c.name === 'Troquelado' ? { ...c, is_active: false } : c);
    expect(resolveCostOverrides(withInactive, SPEC).troquelado_per_hour).toBeUndefined();
  });
});

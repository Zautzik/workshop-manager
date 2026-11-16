import { describe, it, expect } from 'vitest';
import { resolveCostOverrides, machineHourRate } from '@/lib/costing-resolver';
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
      sheet_width_cm: 70, sheet_height_cm: 100, grammage_gsm: 350, sheets_per_package: null,
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

describe('cordura de precios de sustrato', () => {
  it('descarta el ponderado fuera de escala y cae al catálogo', () => {
    // El defecto real: los lotes traían cartulina a $3,20/kg y el motor los
    // prefería sobre los $2.800 del catálogo — 875 veces menos.
    const material: MaterialCost[] = [{
      item_id: '1', sku: 'CAR-350', name: 'Cartulina C1S 350gsm', unit: 'kg', category: 'papel',
      estimated_unit_cost: 3000, weighted_cost: 3.2, lot_count: 1, total_received: 100,
      latest_cost: 3.2, latest_received: '2026-06-01',
      sheet_width_cm: 70, sheet_height_cm: 100, grammage_gsm: 350, sheets_per_package: null,
    }];
    const o = resolveCostOverrides(CATALOG, { ...SPEC, substrate_type: 'cartulina', grammage_gsm: 350 }, material);
    expect(o.substrate_per_kg).toBe(3000); // catálogo, no el ponderado absurdo
  });

  it('convierte una resma a kilos en vez de descartarla', () => {
    // Bond 80 g en 70×100: la resma pesa 28 kg, así que $32.200 → $1.150/kg.
    const material: MaterialCost[] = [{
      item_id: '2', sku: 'BON-080', name: 'Bond 80gsm pliego', unit: 'resma', category: 'papel',
      estimated_unit_cost: 32200, weighted_cost: 32200, lot_count: 2, total_received: 40,
      latest_cost: 32200, latest_received: '2026-06-01',
      sheet_width_cm: 70, sheet_height_cm: 100, grammage_gsm: 80, sheets_per_package: 500,
    }];
    const o = resolveCostOverrides(CATALOG, { ...SPEC, substrate_type: 'bond', grammage_gsm: 80 }, material);
    expect(o.substrate_per_kg).toBeCloseTo(1150, 0);
  });
});

/**
 * Equipos → Economía compara el costo real de la máquina contra ESTA tarifa.
 * Antes buscaba la suya y terminaba usando el sueldo del operario de prensa
 * ($8.500/h) para todas las máquinas, guillotinas incluidas.
 */
describe('machineHourRate', () => {
  const FALLBACK = { offset_print_per_hour: 25000, cut_per_hour: 15000, troquelado_per_hour: 20000 };
  const WITH_WAGE: CostCenterItem[] = [
    ...CATALOG,
    { ...cat('Operador de Prensa', 'mano_de_obra', 8500), catalog_key: 'operador_prensa' } as CostCenterItem,
  ];

  it('a guillotine is charged the cutting rate, not the press rate', () => {
    expect(machineHourRate({ type: 'guillotine' }, WITH_WAGE, FALLBACK)).toMatchObject({ rate: 18000, source: 'catalogo' });
  });

  it('a die cutter is charged the die-cutting rate', () => {
    expect(machineHourRate({ type: 'die_cutter' }, WITH_WAGE, FALLBACK)).toMatchObject({ rate: 25000, source: 'catalogo' });
  });

  it('a press is charged by its own colour count', () => {
    expect(machineHourRate({ type: 'offset_printer', colors: 1 }, WITH_WAGE, FALLBACK)?.rate).toBe(35000);
    expect(machineHourRate({ type: 'offset_printer', colors: 2 }, WITH_WAGE, FALLBACK)?.rate).toBe(55000);
    expect(machineHourRate({ type: 'offset_printer', colors: 4 }, WITH_WAGE, FALLBACK)?.rate).toBe(85000);
  });

  it('a press with no colour count uses the four-colour rate', () => {
    expect(machineHourRate({ type: 'offset_printer', colors: null }, WITH_WAGE, FALLBACK)?.rate).toBe(85000);
  });

  it("never returns the operator's wage as a machine rate", () => {
    for (const type of ['guillotine', 'die_cutter', 'offset_printer']) {
      expect(machineHourRate({ type, colors: 4 }, WITH_WAGE, FALLBACK)?.rate).not.toBe(8500);
    }
  });

  it('machine types the ledger does not charge by the hour have no rate', () => {
    for (const type of ['folder', 'laminator', 'manual_workshop', 'delivery', 'digital_printer']) {
      expect(machineHourRate({ type }, WITH_WAGE, FALLBACK)).toBeNull();
    }
  });

  it('flags the engine default when the catalog has no rate', () => {
    expect(machineHourRate({ type: 'guillotine' }, [], FALLBACK)).toMatchObject({ rate: 15000, source: 'supuesto' });
  });

  it('matches what a closed stage pass is valued at', () => {
    const spec = { color_front: 'cmyk', color_back: 'sin_impresion', substrate_type: '', grammage_gsm: 0 };
    expect(machineHourRate({ type: 'guillotine' }, WITH_WAGE, FALLBACK)?.rate)
      .toBe(resolveCostOverrides(WITH_WAGE, spec).cut_per_hour);
  });
});

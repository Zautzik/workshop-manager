import { describe, it, expect } from 'vitest';
import { computePartCalibration, type CalibrationPart, type CalibrationOrder } from '../part-calibration';

function part(overrides: Partial<CalibrationPart> = {}): CalibrationPart {
  return {
    id: 'part-1',
    name: 'Rodillo',
    machineId: 'machine-1',
    machineName: 'Roland 300',
    usageUnit: 'impressions',
    expectedLifeUsage: 100_000,
    lastReplacedUsage: null,
    lastReplacedAt: null,
    ...overrides,
  };
}

function order(overrides: Partial<CalibrationOrder> = {}): CalibrationOrder {
  return {
    id: 'order-1',
    partId: 'part-1',
    usageAtCreation: 120_000,
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('computePartCalibration', () => {
  it('sin orden correctiva para la pieza, no hay lectura', () => {
    expect(computePartCalibration([part()], [])).toEqual([]);
  });

  it('sin expected_life_usage, se omite aunque haya orden', () => {
    const p = part({ expectedLifeUsage: null });
    expect(computePartCalibration([p], [order()])).toEqual([]);
  });

  it('primera falla sin línea base conocida (nunca se registró cambio), se omite', () => {
    const p = part({ lastReplacedUsage: null, lastReplacedAt: null });
    expect(computePartCalibration([p], [order()])).toEqual([]);
  });

  it('primera falla con línea base registrada ANTES de la falla, calcula el delta', () => {
    const p = part({ lastReplacedUsage: 20_000, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const o = order({ usageAtCreation: 120_000, createdAt: '2026-05-01T00:00:00Z' });
    const result = computePartCalibration([p], [o]);
    expect(result).toHaveLength(1);
    expect(result[0].observedLifeUsage).toBe(100_000);
    expect(result[0].deltaPct).toBe(0);
  });

  it('línea base registrada DESPUÉS de la falla no sirve (fue el reemplazo posterior), se omite', () => {
    const p = part({ lastReplacedUsage: 20_000, lastReplacedAt: '2026-06-01T00:00:00Z' });
    const o = order({ usageAtCreation: 120_000, createdAt: '2026-05-01T00:00:00Z' });
    expect(computePartCalibration([p], [o])).toEqual([]);
  });

  it('segunda falla usa la lectura de la falla anterior como línea base, no last_replaced_usage', () => {
    const p = part({ lastReplacedUsage: 999_999, lastReplacedAt: '2020-01-01T00:00:00Z' });
    const o1 = order({ id: 'o1', usageAtCreation: 100_000, createdAt: '2026-01-01T00:00:00Z' });
    const o2 = order({ id: 'o2', usageAtCreation: 195_000, createdAt: '2026-06-01T00:00:00Z' });
    const result = computePartCalibration([p], [o1, o2]);
    expect(result).toHaveLength(1);
    // Sólo se queda con la MÁS RECIENTE -- 195000 - 100000 = 95000, no la de o1.
    expect(result[0].orderId).toBe('o2');
    expect(result[0].observedLifeUsage).toBe(95_000);
    expect(result[0].deltaPct).toBe(-5);
  });

  it('duró más de lo esperado da delta positivo', () => {
    const p = part({ expectedLifeUsage: 100_000, lastReplacedUsage: 0, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const o = order({ usageAtCreation: 150_000, createdAt: '2026-06-01T00:00:00Z' });
    const result = computePartCalibration([p], [o]);
    expect(result[0].deltaPct).toBe(50);
  });

  it('uso observado cero o negativo (datos corridos) se omite, no revienta', () => {
    const p = part({ lastReplacedUsage: 100_000, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const o = order({ usageAtCreation: 90_000, createdAt: '2026-06-01T00:00:00Z' });
    expect(computePartCalibration([p], [o])).toEqual([]);
  });

  it('orden sin usage_at_creation se ignora', () => {
    const p = part({ lastReplacedUsage: 20_000, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const o = order({ usageAtCreation: null });
    expect(computePartCalibration([p], [o])).toEqual([]);
  });

  it('varias piezas independientes, cada una con su propia lectura', () => {
    const p1 = part({ id: 'p1', name: 'Rodillo', lastReplacedUsage: 0, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const p2 = part({ id: 'p2', name: 'Cuchilla', lastReplacedUsage: 0, lastReplacedAt: '2026-01-01T00:00:00Z' });
    const o1 = order({ id: 'o1', partId: 'p1', usageAtCreation: 100_000, createdAt: '2026-05-01T00:00:00Z' });
    const o2 = order({ id: 'o2', partId: 'p2', usageAtCreation: 50_000, createdAt: '2026-05-01T00:00:00Z' });
    const result = computePartCalibration([p1, p2], [o1, o2]);
    expect(result.map((r) => r.partId).sort()).toEqual(['p1', 'p2']);
  });
});

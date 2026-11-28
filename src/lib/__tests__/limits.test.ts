import { describe, expect, it } from 'vitest';
import { amountCLP, MAX_AMOUNT_CLP, MAX_UNITS, units, wholeUnits, unitCostCLP } from '../limits';

describe('límites de cantidad y monto (auditoría C5)', () => {
  it('rechaza la cantidad de las cotizaciones de prueba (999.999.999)', () => {
    expect(wholeUnits().safeParse(999_999_999).success).toBe(false);
    expect(units().safeParse('999999999').success).toBe(false);
  });

  it('acepta la OT más grande real con holgura', () => {
    expect(wholeUnits().safeParse(592_000).success).toBe(true);
    expect(wholeUnits().safeParse(MAX_UNITS).success).toBe(true);
    expect(amountCLP().safeParse(54_434_340).success).toBe(true);
  });

  it('rechaza montos sobre el tope y negativos', () => {
    expect(amountCLP().safeParse(MAX_AMOUNT_CLP + 1).success).toBe(false);
    expect(amountCLP().safeParse(-1).success).toBe(false);
    expect(unitCostCLP().safeParse(-5).success).toBe(false);
  });

  it('wholeUnits exige enteros; units acepta decimales (kg)', () => {
    expect(wholeUnits().safeParse(1.5).success).toBe(false);
    expect(units().safeParse(1.5).success).toBe(true);
  });

  it('explica el error en castellano', () => {
    const r = wholeUnits().safeParse(MAX_UNITS + 1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/no puede pasar de/);
  });
});

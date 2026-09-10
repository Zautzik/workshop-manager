import { describe, it, expect } from 'vitest';
import { buildMaintenanceMatrix, type MatrixEntry } from '../maintenance-matrix';

function entry(overrides: Partial<MatrixEntry> = {}): MatrixEntry {
  return {
    section: 'Alimentador — Cabezal aspirador',
    frequency: 'weekly',
    actionType: 'lubricate',
    checklistName: 'Roland 300 — Semanal',
    ...overrides,
  };
}

describe('buildMaintenanceMatrix', () => {
  it('sin entradas, matriz vacía', () => {
    expect(buildMaintenanceMatrix([])).toEqual({ rows: [], frequencies: [] });
  });

  it('una fila por sección, una columna por frecuencia, en orden canónico', () => {
    const result = buildMaintenanceMatrix([
      entry({ section: 'Alimentador — General', frequency: 'monthly', actionType: 'inspect' }),
      entry({ section: 'Marcador — Leva', frequency: 'daily', actionType: 'clean' }),
    ]);
    expect(result.frequencies).toEqual(['daily', 'monthly']);
    expect(result.rows.map((r) => r.section)).toEqual(['Alimentador — General', 'Marcador — Leva']);
  });

  it('preserva el orden de primera aparición, no alfabético', () => {
    const result = buildMaintenanceMatrix([
      entry({ section: 'Zzz — Ultimo' }),
      entry({ section: 'Aaa — Primero' }),
    ]);
    expect(result.rows.map((r) => r.section)).toEqual(['Zzz — Ultimo', 'Aaa — Primero']);
  });

  it('varios tipos de acción en la misma sección+frecuencia se combinan sin duplicar', () => {
    const result = buildMaintenanceMatrix([
      entry({ actionType: 'lubricate' }),
      entry({ actionType: 'inspect' }),
      entry({ actionType: 'lubricate' }), // repetido, no debe duplicarse
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.weekly.sort()).toEqual(['inspect', 'lubricate']);
  });

  it('una celda sin ningún ítem no aparece -- vacía de verdad, no un placeholder', () => {
    const result = buildMaintenanceMatrix([
      entry({ section: 'Alimentador — General', frequency: 'weekly' }),
    ]);
    expect(result.rows[0].cells.monthly).toBeUndefined();
  });

  it('un ítem sin actionType SÍ deja marca de que hay algo ahí, sólo que sin categoría', () => {
    const result = buildMaintenanceMatrix([
      entry({ actionType: null }),
    ]);
    expect(result.rows[0].cells.weekly).toEqual([]);
  });

  it('una section que en realidad es una frecuencia mal migrada cae al nombre del checklist', () => {
    // Regresión real: el manual japonés de la Ryobi 524GS migró algunos
    // ítems con la frecuencia como section ("Anual", "Cada 2 semanas") en
    // vez de un componente real -- ninguna de las dos ni siquiera coincide
    // con las etiquetas canónicas de frequencyLabel, así que la señal real
    // es la ausencia del separador "—" que sí usan las secciones genuinas.
    const result = buildMaintenanceMatrix([
      entry({ section: 'Anual', checklistName: 'Ryobi Offset 524GS — Anual (manual japonés)' }),
      entry({ section: 'Cada 2 semanas', checklistName: 'Ryobi Offset 524GS — Quincenal (manual japonés)', frequency: 'biweekly' }),
    ]);
    expect(result.rows.map((r) => r.section)).toEqual([
      'Ryobi Offset 524GS — Anual (manual japonés)',
      'Ryobi Offset 524GS — Quincenal (manual japonés)',
    ]);
  });

  it('section vacía o ausente también cae al nombre del checklist', () => {
    const result = buildMaintenanceMatrix([entry({ section: null })]);
    expect(result.rows[0].section).toBe('Roland 300 — Semanal');
  });

  it('la misma sección repetida en dos checklists de distinta frecuencia queda en UNA fila con dos columnas', () => {
    const result = buildMaintenanceMatrix([
      entry({ section: 'Alimentador — General', frequency: 'weekly', actionType: 'check' }),
      entry({ section: 'Alimentador — General', frequency: 'monthly', actionType: 'lubricate' }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.weekly).toEqual(['check']);
    expect(result.rows[0].cells.monthly).toEqual(['lubricate']);
  });
});

import { describe, expect, it } from 'vitest';
import { laborLineDescription, personOfLaborLine } from '../labor-line';

describe('línea de mano de obra: lo que se escribe se puede leer', () => {
  it('ida y vuelta con el nombre', () => {
    const d = laborLineDescription({ who: 'Ana Soto', hours: 2, shiftName: 'Mañana', date: '2026-11-12', missingRate: false });
    expect(d).toBe('Mano de obra — Ana Soto (2 h, turno Mañana 2026-11-12)');
    expect(personOfLaborLine(d)).toBe('Ana Soto');
  });

  it('no duplica «turno» y marca la tarifa faltante', () => {
    const d = laborLineDescription({ who: 'José (Pepe) Díaz', hours: 1.5, shiftName: 'Turno Tarde', date: '2026-11-13', missingRate: true });
    expect(d).toBe('Mano de obra — José (Pepe) Díaz (1.5 h, Turno Tarde 2026-11-13, sin tarifa en Planta)');
    // Un paréntesis dentro del nombre corta ahí: es la regla que ya tenía el lector.
    expect(personOfLaborLine(d)).toBe('José');
  });

  it('una línea que no es de mano de obra no tiene persona', () => {
    expect(personOfLaborLine('Papel couché 150 g')).toBeNull();
    expect(personOfLaborLine(null)).toBeNull();
  });
});

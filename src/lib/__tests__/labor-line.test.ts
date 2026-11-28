import { describe, expect, it } from 'vitest';
import { laborLineDescription, laborLinePerson, personOfLaborLine } from '../labor-line';

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

  describe('laborLinePerson: la persona sale del id, no del texto', () => {
    const names = new Map([['e1', 'Ana Soto'], ['e2', 'Ana Soto']]);
    const text = 'Mano de obra — Ana Soto (2 h, turno Mañana 2026-11-12)';

    it('dos personas con el mismo nombre quedan separadas por su id', () => {
      const a = laborLinePerson({ employee_id: 'e1', description: text }, names);
      const b = laborLinePerson({ employee_id: 'e2', description: text }, names);
      expect(a?.key).not.toBe(b?.key);
      expect(a?.name).toBe('Ana Soto');
    });

    it('con id, muestra el nombre ACTUAL de la ficha aunque el texto diga otro', () => {
      const renamed = new Map([['e1', 'Ana Soto Pérez']]);
      expect(laborLinePerson({ employee_id: 'e1', description: text }, renamed)?.name).toBe('Ana Soto Pérez');
    });

    it('sin id (línea vieja), cae al nombre del texto y nunca se mezcla con un id', () => {
      const p = laborLinePerson({ employee_id: null, description: text }, names);
      expect(p).toEqual({ key: 'name:Ana Soto', employeeId: null, name: 'Ana Soto' });
    });

    it('sin id ni nombre en el texto, no hay persona', () => {
      expect(laborLinePerson({ employee_id: null, description: 'Papel couché' }, names)).toBeNull();
    });
  });

  it('una línea que no es de mano de obra no tiene persona', () => {
    expect(personOfLaborLine('Papel couché 150 g')).toBeNull();
    expect(personOfLaborLine(null)).toBeNull();
  });
});

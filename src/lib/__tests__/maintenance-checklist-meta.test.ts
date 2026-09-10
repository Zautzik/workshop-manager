import { describe, it, expect } from 'vitest';
import {
  actionTypeMeta, ACTION_TYPE_FALLBACK, ACTION_TYPE_META,
  frequencyLabel, compareFrequency, FREQUENCY_ORDER,
} from '../maintenance-checklist-meta';

describe('actionTypeMeta', () => {
  it('resuelve un tipo real', () => {
    expect(actionTypeMeta('clean')).toBe(ACTION_TYPE_META.clean);
  });

  it('cae al neutro sin inventar una categoría para null/undefined/desconocido', () => {
    expect(actionTypeMeta(null)).toBe(ACTION_TYPE_FALLBACK);
    expect(actionTypeMeta(undefined)).toBe(ACTION_TYPE_FALLBACK);
    expect(actionTypeMeta('algo-que-no-existe')).toBe(ACTION_TYPE_FALLBACK);
  });
});

describe('frequencyLabel', () => {
  it('traduce las frecuencias reales', () => {
    expect(frequencyLabel('weekly')).toBe('Semanal');
    expect(frequencyLabel('as_needed')).toBe('Según necesidad');
  });

  it('sin frecuencia dice explícitamente que no hay, no la omite en silencio', () => {
    expect(frequencyLabel(null)).toBe('Sin frecuencia');
  });

  it('una frecuencia desconocida se muestra tal cual, no rompe', () => {
    expect(frequencyLabel('bisemanal-rara')).toBe('bisemanal-rara');
  });
});

describe('compareFrequency', () => {
  it('ordena de más frecuente a menos, siguiendo FREQUENCY_ORDER', () => {
    const shuffled = ['annual', 'daily', 'monthly', 'weekly'];
    expect([...shuffled].sort(compareFrequency)).toEqual(['daily', 'weekly', 'monthly', 'annual']);
  });

  it('una frecuencia desconocida se va al final, sin romper el orden de las demás', () => {
    const withUnknown = ['weekly', 'misterio', 'daily'];
    expect([...withUnknown].sort(compareFrequency)).toEqual(['daily', 'weekly', 'misterio']);
  });

  it('FREQUENCY_ORDER cubre todas las frecuencias reales encontradas en producción', () => {
    const real = ['as_needed', 'weekly', 'monthly', 'quarterly', 'daily', 'semiannual', 'biweekly', 'annual'];
    for (const f of real) expect(FREQUENCY_ORDER).toContain(f);
  });
});

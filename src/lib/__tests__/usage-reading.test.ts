import { describe, expect, it } from 'vitest';
import { checkUsageReading } from '../usage-reading';

const prev = (reading: number, read_at = '2026-11-01T12:00:00Z') => ({ reading, read_at });

describe('lecturas de contador posibles (auditoría H1)', () => {
  it('rechaza 25 millones de "horas" en una máquina por horas', () => {
    const r = checkUsageReading({ unit: 'hours', reading: 25_019_831, readAt: '2026-11-02T12:00:00Z', previous: prev(13_000) });
    expect(r.ok).toBe(false);
  });

  it('acepta un día normal de trabajo', () => {
    expect(checkUsageReading({ unit: 'hours', reading: 13_016, readAt: '2026-11-02T12:00:00Z', previous: prev(13_000) }).ok).toBe(true);
    expect(checkUsageReading({ unit: 'impressions', reading: 2_100_000, readAt: '2026-11-02T12:00:00Z', previous: prev(2_000_000) }).ok).toBe(true);
  });

  it('una lectura atrasada de un mes puede subir lo de un mes', () => {
    expect(checkUsageReading({ unit: 'hours', reading: 13_600, readAt: '2026-12-01T12:00:00Z', previous: prev(13_000) }).ok).toBe(true);
  });

  it('retroceder sigue permitido (contador cambiado); la ruta avisa', () => {
    expect(checkUsageReading({ unit: 'hours', reading: 5, readAt: '2026-11-02T12:00:00Z', previous: prev(13_000) }).ok).toBe(true);
  });

  it('dos lecturas el mismo día tienen al menos un día de margen', () => {
    expect(checkUsageReading({ unit: 'hours', reading: 13_020, readAt: '2026-11-01T12:05:00Z', previous: prev(13_000) }).ok).toBe(true);
  });

  it('primera lectura: sólo un tope absoluto, y el error explica la unidad', () => {
    expect(checkUsageReading({ unit: 'hours', reading: 50_000, readAt: '2026-11-02T12:00:00Z', previous: null }).ok).toBe(true);
    const r = checkUsageReading({ unit: 'hours', reading: 25_019_831, readAt: '2026-11-02T12:00:00Z', previous: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/horas/);
  });
});

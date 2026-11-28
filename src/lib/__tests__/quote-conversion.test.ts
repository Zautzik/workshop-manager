import { describe, expect, it } from 'vitest';
import { quoteConversionByMonth, winRate } from '../quote-conversion';

describe('conversión de cotizaciones por mes (auditoría M8)', () => {
  const rows = [
    { status: 'converted', created_at: '2026-10-03T10:00:00Z' },
    { status: 'signed', created_at: '2026-10-20T10:00:00Z' },
    { status: 'rejected', created_at: '2026-10-21T10:00:00Z' },
    { status: 'draft', created_at: '2026-11-02T10:00:00Z' },
    { status: 'expired', created_at: '2026-11-05T10:00:00Z' },
  ];

  it('agrupa por mes, en orden, y separa ganadas / perdidas / abiertas', () => {
    expect(quoteConversionByMonth(rows)).toEqual([
      { month: '2026-10', quoted: 3, won: 2, lost: 1, open: 0 },
      { month: '2026-11', quoted: 2, won: 0, lost: 1, open: 1 },
    ]);
  });

  it('la tasa es sobre lo decidido; sin decisiones no hay tasa', () => {
    expect(winRate({ won: 2, lost: 1 })).toBe(67);
    expect(winRate({ won: 0, lost: 0 })).toBeNull();
  });
});

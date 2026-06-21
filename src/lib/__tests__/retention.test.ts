import { describe, it, expect } from 'vitest';
import {
  RETENTION_YEARS, retentionUntil, isUnderRetention, canPurge, summarizeRetention,
} from '@/lib/retention';

const NOW = new Date('2026-06-21T00:00:00Z');

describe('retention policy', () => {
  it('holds records for the configured number of years', () => {
    expect(RETENTION_YEARS).toBe(5);
    expect(retentionUntil('2020-06-21T00:00:00Z').getUTCFullYear()).toBe(2025);
  });

  it('isUnderRetention is true within the window, false after', () => {
    expect(isUnderRetention('2025-06-21T00:00:00Z', NOW)).toBe(true);  // held until 2030
    expect(isUnderRetention('2020-01-01T00:00:00Z', NOW)).toBe(false); // held until 2025 (past)
  });

  it('canPurge only once retention has elapsed', () => {
    expect(canPurge('2020-01-01T00:00:00Z', NOW)).toBe(true);
    expect(canPurge('2025-06-21T00:00:00Z', NOW)).toBe(false);
  });
});

describe('summarizeRetention', () => {
  it('splits held vs eligible and computes the key dates', () => {
    const s = summarizeRetention(
      ['2026-01-01T00:00:00Z', '2020-01-01T00:00:00Z', '2026-06-01T00:00:00Z'],
      NOW,
    );
    expect(s.total).toBe(3);
    expect(s.under_retention).toBe(2);   // the two 2026 records
    expect(s.past_retention).toBe(1);    // the 2020 record
    expect(s.oldest).toBe('2020-01-01T00:00:00Z');
    // next held record to pass its window = oldest still-held (2026-01-01) + 5y
    expect(s.next_retention_expiry).toBe(retentionUntil('2026-01-01T00:00:00Z').toISOString());
    expect(s.retained_through).toBe(retentionUntil('2026-06-01T00:00:00Z').toISOString());
  });

  it('handles an empty set', () => {
    const s = summarizeRetention([], NOW);
    expect(s.total).toBe(0);
    expect(s.oldest).toBeNull();
    expect(s.next_retention_expiry).toBeNull();
  });
});

/**
 * FSSC 22000 records retention policy (document control, clause on records).
 * Traceability records — OTs and their dossier evidence (lots, certs, photos,
 * approvals, status history) — must be retained at least RETENTION_YEARS. Nothing
 * may be purged before its retention date; the Kidney "holds" until then.
 */
export const RETENTION_YEARS = 5;

/** The date a record created on `createdAt` may first be archived/purged. */
export function retentionUntil(createdAt: string | Date): Date {
  const d = new Date(createdAt);
  const until = new Date(d);
  until.setFullYear(until.getFullYear() + RETENTION_YEARS);
  return until;
}

/** True while the record is still within its mandatory retention window. */
export function isUnderRetention(createdAt: string | Date, now: Date = new Date()): boolean {
  return retentionUntil(createdAt).getTime() > now.getTime();
}

/**
 * Guard for any deletion path: records under retention MUST NOT be purged.
 * Returns true only once the retention window has elapsed.
 */
export function canPurge(createdAt: string | Date, now: Date = new Date()): boolean {
  return !isUnderRetention(createdAt, now);
}

export interface RetentionSummary {
  total: number;
  under_retention: number;
  past_retention: number;
  oldest: string | null;
  /** When the next still-retained record passes its window (the oldest held one). */
  next_retention_expiry: string | null;
  /** The most recent record is held until this date. */
  retained_through: string | null;
}

/** Summarize retention status across a set of record creation dates. */
export function summarizeRetention(createdDates: string[], now: Date = new Date()): RetentionSummary {
  const sorted = createdDates.filter(Boolean).slice().sort();
  const total = sorted.length;
  let underRetention = 0;
  let firstUnderRetention: string | null = null;
  for (const d of sorted) {
    if (isUnderRetention(d, now)) {
      underRetention += 1;
      if (firstUnderRetention === null) firstUnderRetention = d; // sorted asc → oldest held first
    }
  }
  const oldest = sorted[0] ?? null;
  const newest = sorted[total - 1] ?? null;
  return {
    total,
    under_retention: underRetention,
    past_retention: total - underRetention,
    oldest,
    next_retention_expiry: firstUnderRetention ? retentionUntil(firstUnderRetention).toISOString() : null,
    retained_through: newest ? retentionUntil(newest).toISOString() : null,
  };
}

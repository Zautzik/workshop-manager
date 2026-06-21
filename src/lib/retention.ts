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

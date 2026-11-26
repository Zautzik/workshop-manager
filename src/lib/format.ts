/**
 * @fileoverview Shared formatting utilities for Chilean Peso (CLP).
 *
 * CLP has no subunit (no cents). All monetary amounts must be integers.
 * Never use floating-point arithmetic directly on money — always go through
 * `pesos()` which snaps the result to the nearest integer peso.
 */

const CLP_FORMAT = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/**
 * Format a Chilean Peso amount for display.
 * Always rounds to the nearest integer peso — CLP has no cents.
 *
 * Output example: "$1.234.567"
 */
export function formatCLP(amount: number): string {
  return CLP_FORMAT.format(Math.round(amount));
}

/**
 * Multiply a quantity (float) by an integer unit cost and snap to the
 * nearest integer peso.  Use this instead of:
 *   Number((qty * rate).toFixed(0))   ← buggy: toFixed has float issues
 *   Math.round(qty * rate)            ← ok but intent is unclear
 *
 * Example: pesos(1.23, 18_000) === 22_140
 */
export function pesos(quantity: number, unitCost: number): number {
  return Math.round(quantity * unitCost);
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * A calendar date («29 oct 2026», or «29 oct» with `withYear: false») from a
 * stored date or timestamp, WITHOUT a time-zone shift.
 *
 * `scheduled_date` and `deadline` come back as «2026-10-29» or
 * «2026-10-29T00:00:00+00:00»: midnight UTC. `new Date(...)` turns that into
 * the evening of the 28th in Chile, and printing it raw showed the ISO string
 * on the public QR page (audit H2). The day the user picked is the first ten
 * characters — that is what gets shown.
 */
export function formatCalendarDate(value: string | null | undefined, opts: { withYear?: boolean } = {}): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
	if (!m) return '—';
	const [, y, mo, d] = m;
	const day = `${Number(d)} ${MESES_CORTOS[Number(mo) - 1]}`;
	return opts.withYear === false ? day : `${day} ${y}`;
}

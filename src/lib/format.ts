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
